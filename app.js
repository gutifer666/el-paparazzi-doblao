/**
 * ==========================================================================
 * BODA-APP: CLIENT-SIDE PHOTO UPLOAD AND QR GENERATOR (SPA)
 * ==========================================================================
 * 
 * 🛠️ CONFIGURACIÓN DEL BACKEND (GOOGLE APPS SCRIPT):
 * --------------------------------------------------------------------------
 * Para que las fotos se guarden en Google Drive, debes desplegar un script 
 * en Google Apps Script como "Web App" (Ejecutar como: Tú, Acceso: Cualquiera).
 * 
 * Copia y pega el siguiente código en tu proyecto de Google Apps Script:
 * 
 * ```javascript
 * function doPost(e) {
 *   try {
 *     var data = JSON.parse(e.postData.contents);
 *     var filename = data.filename;
 *     var mimeType = data.mimeType;
 *     var base64Data = data.base64;
 *     
 *     // Decodificar Base64
 *     var decoded = Utilities.base64Decode(base64Data);
 *     var blob = Utilities.newBlob(decoded, mimeType, filename);
 *     
 *     // Guardar en una carpeta específica de Drive
 *     // Reemplaza "ID_DE_TU_CARPETA" con el ID real de tu carpeta de Google Drive
 *     var folder = DriveApp.getFolderById("ID_DE_TU_CARPETA");
 *     var file = folder.createFile(blob);
 *     
 *     return ContentService.createTextOutput(JSON.stringify({ 
 *       status: 'success', 
 *       fileId: file.getId(), 
 *       url: file.getUrl() 
 *     })).setMimeType(ContentService.MimeType.JSON);
 *     
 *   } catch(error) {
 *     return ContentService.createTextOutput(JSON.stringify({ 
 *       status: 'error', 
 *       message: error.toString() 
 *     })).setMimeType(ContentService.MimeType.JSON);
 *   }
 * }
 * ```
 */

// ⚠️ ESCRIBE AQUÍ LA URL DE TU GOOGLE APPS SCRIPT DESPLEGADO:
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx7AinWlHsVdeDcTEIJrkVK-N38Xil10_z6_h0QVUKSQUKTrVjuHub14ZXS3AY0Lddc/exec";

// State Management
let selectedFile = null;
let imageBase64 = null;
let qrCodeInstance = null;

// DOM Elements
const elements = {
    // Views
    guestView: document.getElementById('guest-view'),
    adminView: document.getElementById('admin-view'),
    
    // File Input / Capture
    photoInput: document.getElementById('photo-input'),
    uploadTriggerBtn: document.getElementById('upload-trigger-btn'),
    
    // Previews & Actions
    previewCard: document.getElementById('preview-card'),
    imagePreview: document.getElementById('image-preview'),
    cancelBtn: document.getElementById('cancel-btn'),
    sendBtn: document.getElementById('send-btn'),
    
    // Modals
    passwordModal: document.getElementById('password-modal'),
    adminPasswordInput: document.getElementById('admin-password-input'),
    passwordError: document.getElementById('password-error'),
    passwordCancelBtn: document.getElementById('password-cancel-btn'),
    passwordSubmitBtn: document.getElementById('password-submit-btn'),
    closePasswordModal: document.getElementById('close-password-modal'),
    
    // Overlays & Status
    loaderOverlay: document.getElementById('loader-overlay'),
    loaderTitle: document.getElementById('loader-title'),
    loaderSubtitle: document.getElementById('loader-subtitle'),
    uploadProgress: document.getElementById('upload-progress'),
    
    notificationOverlay: document.getElementById('notification-overlay'),
    notificationTitle: document.getElementById('notification-title'),
    notificationMessage: document.getElementById('notification-message'),
    notificationCloseBtn: document.getElementById('notification-close-btn'),
    
    // Admin View controls
    adminLoginTrigger: document.getElementById('admin-login-trigger'),
    adminBackBtn: document.getElementById('admin-back-btn'),
    qrSizeSelect: document.getElementById('qr-size-select'),
    printBtn: document.getElementById('print-btn'),
    printUrlText: document.getElementById('print-url-text'),
    qrcodeContainer: document.getElementById('qrcode'),
    resizeCanvas: document.getElementById('resize-canvas')
};

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
});

function initEventListeners() {
    // Photo upload trigger
    elements.uploadTriggerBtn.addEventListener('click', () => {
        elements.photoInput.click();
    });

    // Handle photo selection
    elements.photoInput.addEventListener('change', handlePhotoSelection);

    // Cancel / Discard photo preview
    elements.cancelBtn.addEventListener('click', resetGuestUploadView);

    // Send photo trigger
    elements.sendBtn.addEventListener('click', processAndSendPhoto);

    // Open Admin Access Modal
    elements.adminLoginTrigger.addEventListener('click', () => {
        if (sessionStorage.getItem('isAdminAuthorized') === 'true') {
            switchView('admin');
        } else {
            showModal(elements.passwordModal);
        }
    });

    // Close password modal actions
    elements.closePasswordModal.addEventListener('click', closePasswordModal);
    elements.passwordCancelBtn.addEventListener('click', closePasswordModal);

    // Submit password actions
    elements.passwordSubmitBtn.addEventListener('click', handlePasswordSubmit);
    elements.adminPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handlePasswordSubmit();
        }
    });

    // Admin view: Back to guest view
    elements.adminBackBtn.addEventListener('click', () => {
        switchView('guest');
    });

    // Admin view: Handle QR size dropdown change
    elements.qrSizeSelect.addEventListener('change', (e) => {
        const size = parseInt(e.target.value, 10);
        generateQRCode(size);
    });

    // Admin view: Trigger Print
    elements.printBtn.addEventListener('click', () => {
        window.print();
    });

    // Close thank you modal
    elements.notificationCloseBtn.addEventListener('click', () => {
        hideModal(elements.notificationOverlay);
        resetGuestUploadView();
    });
}

/* ==========================================================================
   SPA VIEW SWEEP & ROUTING
   ========================================================================== */
function switchView(viewName) {
    if (viewName === 'admin') {
        elements.guestView.classList.remove('active');
        elements.guestView.classList.add('hidden');
        elements.adminView.classList.remove('hidden');
        elements.adminView.classList.add('active');
        
        // Generate QR code for the current URL
        const initialSize = parseInt(elements.qrSizeSelect.value, 10) || 256;
        generateQRCode(initialSize);
    } else {
        elements.adminView.classList.remove('active');
        elements.adminView.classList.add('hidden');
        elements.guestView.classList.remove('hidden');
        elements.guestView.classList.add('active');
    }
}

/* ==========================================================================
   ADMIN ACCESS CONTROLS (PASSWORD MODAL)
   ========================================================================== */
function showModal(modalElement) {
    modalElement.classList.remove('hidden');
    // Force reflow for transitions
    modalElement.offsetHeight;
    modalElement.classList.add('active');
    
    // Auto-focus on input if it's the password modal
    if (modalElement === elements.passwordModal) {
        setTimeout(() => {
            elements.adminPasswordInput.focus();
        }, 100);
    }
}

function hideModal(modalElement) {
    modalElement.classList.remove('active');
    setTimeout(() => {
        modalElement.classList.add('hidden');
    }, 300); // match CSS transition duration
}

function closePasswordModal() {
    hideModal(elements.passwordModal);
    elements.adminPasswordInput.value = '';
    elements.passwordError.classList.add('hidden');
}

function handlePasswordSubmit() {
    const enteredPassword = elements.adminPasswordInput.value;
    
    // Simple hardcoded password check
    if (enteredPassword === '1234') {
        sessionStorage.setItem('isAdminAuthorized', 'true');
        closePasswordModal();
        switchView('admin');
    } else {
        elements.passwordError.classList.remove('hidden');
        elements.adminPasswordInput.focus();
        elements.adminPasswordInput.select();
        // Shake animation helper
        const modalContent = elements.passwordModal.querySelector('.modal-card');
        modalContent.style.animation = 'shake 0.3s ease-in-out';
        setTimeout(() => {
            modalContent.style.animation = '';
        }, 300);
    }
}

// Dynamic shake keyframes injection (just in case browser isn't configured)
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-8px); }
        75% { transform: translateX(8px); }
    }
`;
document.head.appendChild(style);

/* ==========================================================================
   PHOTO SELECTION & PREVIEW
   ========================================================================== */
function handlePhotoSelection(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    selectedFile = files[0];
    
    // Simple MIME validation
    if (!selectedFile.type.startsWith('image/')) {
        alert('Por favor, selecciona un archivo de imagen válido.');
        resetGuestUploadView();
        return;
    }

    // Read file for preview screen
    const reader = new FileReader();
    reader.onload = (e) => {
        elements.imagePreview.src = e.target.result;
        elements.previewCard.classList.remove('hidden');
        
        // Smooth scroll to preview card for better mobile feedback
        elements.previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    reader.readAsDataURL(selectedFile);
}

function resetGuestUploadView() {
    elements.photoInput.value = '';
    selectedFile = null;
    imageBase64 = null;
    elements.previewCard.classList.add('hidden');
    elements.imagePreview.src = '';
}

/* ==========================================================================
   IMAGE COMPRESSION & UPLOAD LOGIC
   ========================================================================== */
function processAndSendPhoto() {
    if (!selectedFile) return;

    // Show loading overlay
    showStatusOverlay('Procesando imagen...', 'Redimensionando y optimizando para carga móvil...');
    animateProgressBar(0, 30, 800); // 30% during compression phase

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        
        img.onload = () => {
            const canvas = elements.resizeCanvas;
            const ctx = canvas.getContext('2d');
            
            let width = img.width;
            let height = img.height;
            const MAX_DIMENSION = 1920;

            // Calculate resized dimensions maintaining aspect ratio
            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                if (width > height) {
                    height = Math.round((height * MAX_DIMENSION) / width);
                    width = MAX_DIMENSION;
                } else {
                    width = Math.round((width * MAX_DIMENSION) / height);
                    height = MAX_DIMENSION;
                }
            }

            canvas.width = width;
            canvas.height = height;
            
            // Draw into canvas (resizing action)
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG with 0.8 quality
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            
            // Extract the base64 code string
            imageBase64 = compressedDataUrl.split(',')[1];
            
            // Create formatted filename
            const timestamp = new Date().getTime();
            const cleanName = selectedFile.name
                .replace(/\.[^/.]+$/, "") // strip extension
                .replace(/[^a-zA-Z0-9]/g, '_') // sanitize
                .toLowerCase();
            const filename = `boda_${timestamp}_${cleanName || 'foto'}.jpg`;
            const mimeType = 'image/jpeg';

            // Begin dispatching data
            uploadData(filename, mimeType, imageBase64);
        };

        img.onerror = () => {
            hideModal(elements.loaderOverlay);
            alert('Error al procesar la imagen. Por favor, inténtalo de nuevo.');
        };
    };

    reader.readAsDataURL(selectedFile);
}

function uploadData(filename, mimeType, base64Data) {
    elements.loaderTitle.innerText = "Subiendo foto...";
    elements.loaderSubtitle.innerText = "Enviando tu recuerdo al álbum de la boda.";
    animateProgressBar(30, 70, 1500);

    const payload = {
        filename: filename,
        mimeType: mimeType,
        base64: base64Data
    };

    // If APPS_SCRIPT_URL is not set, simulate standard successful API transaction
    if (!APPS_SCRIPT_URL) {
        console.warn("APPS_SCRIPT_URL no está configurada. Ejecutando simulación local de subida.");
        console.log("Datos de la foto procesada:", {
            filename: payload.filename,
            mimeType: payload.mimeType,
            base64Length: payload.base64.length,
            previewSample: payload.base64.substring(0, 100) + "..."
        });

        // Simulating completion delay
        setTimeout(() => {
            animateProgressBar(70, 100, 500);
            setTimeout(() => {
                hideModal(elements.loaderOverlay);
                showNotification(
                    "¡Muchas Gracias!", 
                    "Tu foto se ha subido correctamente (Simulado). Recuerda configurar APPS_SCRIPT_URL en app.js para la boda real."
                );
            }, 600);
        }, 1800);
        return;
    }

    // Real fetch request to Google Apps Script. 
    // IMPORTANT: Sent as simple POST to avoid preflight CORS pre-checks.
    fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', // standard Apps Script redirect handling
        body: JSON.stringify(payload)
    })
    .then(response => {
        // Since we are using no-cors mode, the response returned is opaque.
        // We won't be able to inspect headers or body directly, but we assume success if no network exception was thrown.
        animateProgressBar(70, 100, 800);
        setTimeout(() => {
            hideModal(elements.loaderOverlay);
            showNotification(
                "¡Muchas Gracias!", 
                "Tu foto se ha subido correctamente al álbum de la boda."
            );
        }, 900);
    })
    .catch(error => {
        console.error("Error al enviar la imagen:", error);
        hideModal(elements.loaderOverlay);
        alert("Ocurrió un error de red al intentar subir tu foto. Por favor, inténtalo de nuevo.");
    });
}

/* ==========================================================================
   ADMIN QR GENERATION
   ========================================================================== */
function generateQRCode(size = 256) {
    elements.qrcodeContainer.innerHTML = ''; // Clear container
    const currentUrl = window.location.href;
    
    // Set printable footer URL text
    elements.printUrlText.innerText = currentUrl;

    try {
        qrCodeInstance = new QRCode(elements.qrcodeContainer, {
            text: currentUrl,
            width: size,
            height: size,
            colorDark: "#2C3E50",
            colorLight: "#FFFFFF",
            correctLevel: QRCode.CorrectLevel.H // High error correction level for solid prints
        });
    } catch (err) {
        console.error("No se pudo generar el código QR:", err);
        elements.qrcodeContainer.innerText = "Error al generar el código QR.";
    }
}

/* ==========================================================================
   UI STATUS OVERLAYS & ANIMATION UTILITIES
   ========================================================================== */
function showStatusOverlay(title, subtitle) {
    elements.loaderTitle.innerText = title;
    elements.loaderSubtitle.innerText = subtitle;
    elements.uploadProgress.style.width = '0%';
    showModal(elements.loaderOverlay);
}

function showNotification(title, message) {
    elements.notificationTitle.innerText = title;
    elements.notificationMessage.innerText = message;
    showModal(elements.notificationOverlay);
}

/**
 * Animate the progress bar fluidly over a set period of time
 */
function animateProgressBar(fromVal, toVal, duration) {
    const startTime = performance.now();
    
    function updateProgress(currentTime) {
        const elapsed = currentTime - startTime;
        const progressRate = Math.min(elapsed / duration, 1);
        
        // Easing calculation (easeOutQuad)
        const easedRate = progressRate * (2 - progressRate);
        const currentProgress = fromVal + (toVal - fromVal) * easedRate;
        
        elements.uploadProgress.style.width = `${currentProgress}%`;
        
        if (progressRate < 1) {
            requestAnimationFrame(updateProgress);
        }
    }
    
    requestAnimationFrame(updateProgress);
}
