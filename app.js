// --- Configuración de Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyDrw6nmfVI-nhHQaCB8ev-KJoxpyTgHZpk",
    authDomain: "app-misiones-133b2.firebaseapp.com",
    projectId: "app-misiones-133b2",
    storageBucket: "app-misiones-133b2.firebasestorage.app",
    messagingSenderId: "987951965159",
    appId: "1:987951965159:web:719225d8b8cb0922465342",
    measurementId: "G-S0G8JHLY3G"
};

// Inicialización Segura de Firebase (Evita que bloqueadores o falta de internet rompan la app)
let db = null;
try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
    } else {
        console.warn("SDK de Firebase no detectado. La app funcionará en modo 100% Local de alto rendimiento.");
    }
} catch (e) {
    console.error("Error al inicializar Firebase:", e);
}

// Estado de la Aplicación
let tasks = [];
let editingTaskId = null;

// Elementos del DOM
const taskForm = document.getElementById('task-form');
const tasksContainer = document.getElementById('tasks-container');
const cloudStatus = document.getElementById('cloud-status');
const cloudStatusText = document.getElementById('cloud-status-text');
const template = document.getElementById('task-card-template');

// --- Persistencia Local (LocalStorage Fallback) ---
function saveToLocalStorage() {
    try {
        localStorage.setItem('misiones_app_tasks', JSON.stringify(tasks));
    } catch (e) {
        console.error("Error al guardar en LocalStorage:", e);
    }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('misiones_app_tasks');
        if (saved) {
            tasks = JSON.parse(saved);
        }
    } catch (e) {
        console.error("Error al cargar de LocalStorage:", e);
        tasks = [];
    }
}

// --- Configuración e Inicialización ---
function init() {
    // 1. Cargar inmediatamente de LocalStorage para que nunca se borre la información al recargar
    loadFromLocalStorage();
    renderTasks();

    if (!db) {
        cloudStatus.classList.remove('online');
        cloudStatus.classList.add('offline');
        cloudStatusText.textContent = 'Modo Local (Sin Conexión)';
        return;
    }

    cloudStatusText.textContent = 'Conectando a la nube...';
    
    // 2. Intentar habilitar la persistencia offline nativa de Firestore
    try {
        db.enablePersistence().catch(err => {
            console.warn("Persistencia offline de Firestore no disponible:", err);
        });
    } catch (e) {
        console.warn("Error al habilitar persistencia:", e);
    }
    
    // 3. Escuchar cambios en la base de datos en tiempo real de forma segura
    try {
        db.collection('tasks').onSnapshot((snapshot) => {
            const cloudTasks = [];
            snapshot.forEach((doc) => {
                cloudTasks.push({
                    ...doc.data(),
                    id: doc.id
                });
            });
            
            // La nube de Firebase es la fuente absoluta de verdad en tiempo real.
            // Sincronizamos las tareas locales exactamente con el estado de la nube.
            tasks = cloudTasks;
            saveToLocalStorage();
            renderTasks();
            
            // Actualizar estado visual de la nube
            cloudStatus.classList.remove('offline');
            cloudStatus.classList.add('online');
            cloudStatusText.textContent = 'Sync: Firebase Cloud';
        }, (error) => {
            console.error("Error de permisos o conexión con Firebase. Usando almacenamiento Local Segurizado: ", error);
            cloudStatus.classList.remove('online');
            cloudStatus.classList.add('offline');
            cloudStatusText.textContent = 'Modo Local (Datos Seguros)';
        });
    } catch (e) {
        console.error("Error al configurar onSnapshot:", e);
        cloudStatusText.textContent = 'Modo Local (Datos Seguros)';
    }
}

// --- Algoritmo de Prioridad ---
function calculatePriorityScore(task) {
    let score = 0;

    // Urgencia (Días restantes)
    const today = new Date();
    today.setHours(0,0,0,0);
    const dueDate = new Date(task.date);
    dueDate.setHours(0,0,0,0); // Normalizar a medianoche para cálculo justo
    
    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Si la tarea está atrasada o es para hoy, sumar mucha urgencia
    if (diffDays <= 0) {
        score += 50; 
    } else if (diffDays <= 3) {
        score += 30; // Muy urgente (1-3 días)
    } else if (diffDays <= 7) {
        score += 15; // Urgente (4-7 días)
    }

    // Tareas realizadas van al fondo independientemente de su puntuación inicial
    if (task.status === 'realizada') {
        score = -100;
    }

    return { score, diffDays };
}

// --- Manejo de Eventos ---
taskForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const taskData = {
        type: document.getElementById('task-type').value,
        subject: document.getElementById('task-subject').value,
        date: document.getElementById('task-date').value,
        desc: document.getElementById('task-desc').value,
        status: document.getElementById('task-status').value,
    };

    if (editingTaskId) {
        // 1. Actualizar localmente de forma instantánea
        const index = tasks.findIndex(t => t.id === editingTaskId);
        if (index !== -1) {
            tasks[index] = { ...tasks[index], ...taskData };
            saveToLocalStorage();
            renderTasks();
        }

        // 2. Intentar actualizar en Firebase de forma segura
        if (db) {
            try {
                db.collection('tasks').doc(editingTaskId).update(taskData)
                    .then(() => console.log("Actualizado en la nube correctamente."))
                    .catch(err => console.warn("Guardado en Local (Nube sin permisos/offline):", err));
            } catch(e) {
                console.warn("Error al intentar guardar en Firebase:", e);
            }
        }

        editingTaskId = null;
        document.getElementById('submit-btn').textContent = 'Añadir Misión';
        taskForm.reset();
    } else {
        // 1. Crear un ID único robusto compatible con local y nube
        const newId = 'mision_' + Date.now();
        const newTask = {
            id: newId,
            ...taskData,
            createdAt: new Date().toISOString()
        };

        // 2. Guardar localmente de forma instantánea
        tasks.push(newTask);
        saveToLocalStorage();
        renderTasks();

        // 3. Intentar guardar en Firebase de forma segura
        if (db) {
            try {
                db.collection('tasks').doc(newId).set(newTask)
                    .then(() => console.log("Guardado en la nube correctamente."))
                    .catch(err => console.warn("Guardado en Local (Nube sin permisos/offline):", err));
            } catch(e) {
                console.warn("Error al intentar guardar en Firebase:", e);
            }
        }

        taskForm.reset();
    }
});

// --- Renderizado ---
function renderTasks() {
    tasksContainer.innerHTML = '';

    if (tasks.length === 0) {
        tasksContainer.innerHTML = '<div class="empty-state">No hay misiones activas. ¡Todo despejado!</div>';
        return;
    }

    // Ordenar aplicando el algoritmo
    const sortedTasks = [...tasks].sort((a, b) => {
        const priorityA = calculatePriorityScore(a).score;
        const priorityB = calculatePriorityScore(b).score;
        return priorityB - priorityA; // De mayor a menor
    });

    sortedTasks.forEach(task => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.task-card');
        
        // Calcular info de prioridad
        const { diffDays } = calculatePriorityScore(task);

        // Llenar datos
        const typeLabels = {
            'examen': 'Examen',
            'prueba': 'Prueba',
            'proyecto': 'Proyecto',
            'informe': 'Informe',
            'deber': 'Deber',
            'taller': 'Taller'
        };
        clone.querySelector('.task-type-badge').textContent = typeLabels[task.type] || task.type;
        clone.querySelector('.task-subject').textContent = task.subject;
        clone.querySelector('.task-desc').textContent = task.desc;
        
        // Manejo de Fechas
        const dateEl = clone.querySelector('.task-date-badge');
        dateEl.textContent = new Date(task.date).toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' });
        if (diffDays <= 3 && task.status !== 'realizada') {
            dateEl.classList.add('date-urgent');
            if (diffDays < 0) dateEl.textContent += ' (¡Atrasada!)';
            else if (diffDays === 0) dateEl.textContent += ' (¡Hoy!)';
        } else {
            dateEl.classList.add('date-normal');
        }

        // Estado visual
        const statusSelect = clone.querySelector('.task-status-update');
        statusSelect.value = task.status;
        if (task.status === 'realizada') {
            card.classList.add('status-realizada');
        }

        // Borde de prioridad según tipo
        if (task.type === 'examen' || task.type === 'proyecto' || task.type === 'prueba') card.classList.add('priority-high');
        else if (task.type === 'deber' || task.type === 'informe') card.classList.add('priority-med');
        else card.classList.add('priority-low');

        // Eventos de la tarjeta
        statusSelect.addEventListener('change', (e) => {
            const newStatus = e.target.value;
            // Actualizar localmente al instante
            task.status = newStatus;
            saveToLocalStorage();
            renderTasks();

            // Actualizar estado en Firebase de forma segura
            if (db) {
                try {
                    db.collection('tasks').doc(task.id).update({
                        status: newStatus
                    }).catch(err => console.warn("Estado actualizado solo en Local:", err));
                } catch(err) {}
            }
        });

        clone.querySelector('.btn-edit').addEventListener('click', () => {
            editingTaskId = task.id;
            
            // Llenar el formulario con los datos
            document.getElementById('task-type').value = task.type;
            document.getElementById('task-subject').value = task.subject;
            document.getElementById('task-date').value = task.date;
            document.getElementById('task-desc').value = task.desc;
            document.getElementById('task-status').value = task.status;
            
            // Cambiar texto del botón
            document.getElementById('submit-btn').textContent = 'Guardar Cambios';
            
            // Hacer scroll hacia el formulario
            document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
        });

        clone.querySelector('.btn-delete').addEventListener('click', () => {
            // Eliminar localmente al instante
            tasks = tasks.filter(t => t.id !== task.id);
            saveToLocalStorage();
            renderTasks();

            // Eliminar de Firebase de forma segura
            if (db) {
                try {
                    db.collection('tasks').doc(task.id).delete()
                        .catch(err => console.warn("Eliminado solo en Local:", err));
                } catch(err) {}
            }
        });

        tasksContainer.appendChild(clone);
    });
}

// Iniciar app
init();
