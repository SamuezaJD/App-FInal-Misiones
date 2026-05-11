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

// Inicializar Firebase (SDK v8 para compatibilidad local)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Estado de la Aplicación
let tasks = [];
let editingTaskId = null;

// Elementos del DOM
const taskForm = document.getElementById('task-form');
const tasksContainer = document.getElementById('tasks-container');
const cloudStatus = document.getElementById('cloud-status');
const cloudStatusText = document.getElementById('cloud-status-text');
const template = document.getElementById('task-card-template');

// --- Configuración e Inicialización ---
function init() {
    cloudStatusText.textContent = 'Conectando a la nube...';
    
    // Escuchar cambios en la base de datos en tiempo real (Sincronización Mágica)
    db.collection('tasks').onSnapshot((snapshot) => {
        tasks = [];
        snapshot.forEach((doc) => {
            tasks.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Actualizar estado visual de la nube
        cloudStatus.classList.remove('offline');
        cloudStatus.classList.add('online');
        cloudStatusText.textContent = 'Sync: Firebase Cloud';
        
        renderTasks();
    }, (error) => {
        console.error("Error al sincronizar con Firebase: ", error);
        cloudStatus.classList.remove('online');
        cloudStatus.classList.add('offline');
        cloudStatusText.textContent = 'Error de Sincronización';
    });
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
        // Actualizar tarea existente en Firebase
        db.collection('tasks').doc(editingTaskId).update(taskData)
            .then(() => {
                editingTaskId = null;
                document.getElementById('submit-btn').textContent = 'Añadir Misión';
                taskForm.reset();
            })
            .catch(err => console.error("Error al actualizar:", err));
    } else {
        // Añadir nueva tarea a Firebase
        const newTask = {
            ...taskData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        db.collection('tasks').add(newTask)
            .then(() => {
                taskForm.reset();
            })
            .catch(err => console.error("Error al guardar:", err));
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

        // Borde de prioridad según tipo (opcional, ahora es visual)
        if (task.type === 'examen' || task.type === 'proyecto' || task.type === 'prueba') card.classList.add('priority-high');
        else if (task.type === 'deber' || task.type === 'informe') card.classList.add('priority-med');
        else card.classList.add('priority-low');

        // Eventos de la tarjeta
        statusSelect.addEventListener('change', (e) => {
            // Actualizar estado en Firebase
            db.collection('tasks').doc(task.id).update({
                status: e.target.value
            }).catch(err => console.error("Error al actualizar estado:", err));
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
            // Eliminar de Firebase
            db.collection('tasks').doc(task.id).delete()
                .catch(err => console.error("Error al eliminar:", err));
        });

        tasksContainer.appendChild(clone);
    });
}

// Iniciar app
init();
