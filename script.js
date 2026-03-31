// ===== Global Variables =====
let gasChart = null;
let tempChart = null;
let soilMoistureChart = null;
let maxDataPoints = 60;  // ⚡ 60 data points untuk 60 detik history
let gasThreshold = 1000;  // Threshold untuk kategori BAHAYA

// Mode sensor gas: true = digital (0/1 DETECTED/CLEAR), false = analog (PPM)
const GAS_DIGITAL_MODE = false;  // Mode analog PPM

// Batas kategori asap (untuk analog mode) - sesuai ESP32
const GAS_BAHAYA_THRESHOLD = 1000;  // < 1000 ppm: AMAN, >= 1000 ppm: BAHAYA

// Data arrays
let labels = [];
let gasData = [];
let tempData = [];
let soilMoistureData = [];

// Performance optimization variables
let lastUpdateTime = 0;
let isUpdating = false;
let updateQueue = [];
const MIN_UPDATE_INTERVAL = 50; // ⚡ 50ms untuk 300ms update dari firmware

// ⚡ Cache DOM elements untuk performa
let cachedElements = {
    thermometerFill: null,
    flameCard: null,
    statusIndicator: null,
    statusText: null,
    flameStatusText: null
};

// ===== Initialize Dashboard =====
document.addEventListener('DOMContentLoaded', () => {
    initializeParticles();
    initializeCharts();
    setupEventListeners();

    addLog('info', 'Dashboard berhasil dimuat.');
    addLog('info', 'Klik "Hubungkan MQTT" untuk menerima data real-time dari ESP32');
});

// ===== Particle Background =====
function initializeParticles() {
    const particlesContainer = document.getElementById('particles');
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (15 + Math.random() * 10) + 's';
        particlesContainer.appendChild(particle);
    }
}

// ===== Initialize Charts =====
function initializeCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 300,
            easing: 'linear'
        },
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: 'rgba(0, 0, 0, 0.2)',
                borderWidth: 1,
                padding: 12,
                displayColors: true,
                callbacks: {
                    title: function(context) {
                        return '⏰ ' + context[0].label;
                    },
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += context.parsed.y;
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(0, 0, 0, 0.1)'
                },
                ticks: {
                    color: '#636e72',
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 10
                }
            },
            y: {
                grid: {
                    color: 'rgba(0, 0, 0, 0.1)'
                },
                ticks: {
                    color: '#636e72'
                }
            }
        }
    };

    // Gas Chart
    const gasCtx = document.getElementById('gasChart').getContext('2d');
    gasChart = new Chart(gasCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gas (ppm)',
                data: gasData,
                borderColor: '#ff7675',
                backgroundColor: 'rgba(255, 118, 117, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointBackgroundColor: '#ff7675',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: '#ff7675',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3
            }]
        },
        options: chartOptions
    });

    // Temperature Chart
    const tempCtx = document.getElementById('tempChart').getContext('2d');
    tempChart = new Chart(tempCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Suhu (°C)',
                data: tempData,
                borderColor: '#fdcb6e',
                backgroundColor: 'rgba(253, 203, 110, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointBackgroundColor: '#fdcb6e',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: '#fdcb6e',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3
            }]
        },
        options: chartOptions
    });

    // Soil Moisture Chart
    const soilMoistureCtx = document.getElementById('soilMoistureChart').getContext('2d');
    soilMoistureChart = new Chart(soilMoistureCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kelembapan Tanah (%)',
                data: soilMoistureData,
                borderColor: '#6ab04c',
                backgroundColor: 'rgba(106, 176, 76, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointBackgroundColor: '#6ab04c',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: '#6ab04c',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3
            }]
        },
        options: {
            ...chartOptions,
            scales: {
                ...chartOptions.scales,
                y: {
                    ...chartOptions.scales.y,
                    min: 0,
                    max: 100
                }
            }
        }
    });
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Clear log button
    document.getElementById('clearLog').addEventListener('click', clearLog);

    // Alert dismiss button
    document.getElementById('alertDismiss').addEventListener('click', hideAlert);

    // MQTT Connect button
    const connectMQTTBtn = document.getElementById('connectMQTTBtn');
    if (connectMQTTBtn) {
        connectMQTTBtn.addEventListener('click', () => {
            if (typeof window.MQTTService !== 'undefined') {
                window.MQTTService.init();
                connectMQTTBtn.disabled = true;
                connectMQTTBtn.textContent = 'Menghubungkan...';
                addLog('info', 'Menghubungkan ke MQTT broker...');
            } else {
                addLog('error', 'MQTT Service tidak tersedia!');
            }
        });
    }

}

// ===== Data Update Functions =====

function updateDashboard(data) {
    // ⚡ Throttle updates - hindari terlalu sering update
    const now = Date.now();
    if (isUpdating || (now - lastUpdateTime < MIN_UPDATE_INTERVAL)) {
        // Queue update jika sedang updating atau terlalu cepat
        updateQueue.push(data);
        return;
    }

    isUpdating = true;
    lastUpdateTime = now;

    console.log('updateDashboard called with data:', data);

    // Use requestAnimationFrame untuk smoother updates
    requestAnimationFrame(() => {
        const timestamp = new Date().toLocaleTimeString('id-ID');

        // Add new data
        labels.push(timestamp);
        gasData.push(data.gas || 0);
        tempData.push(data.temperature || 0);
        soilMoistureData.push(data.soilMoisture || 0);

        // Trim data if exceeds max points
        trimDataArrays();

        // ⚡ Batch DOM updates - kurangi reflow
        batchUpdateUI(data);

        // Update indicators
        updateGasIndicator(data.gas || 0);
        updateThermometer(data.temperature || 0);
        updateTempTrend(data.temperature || 0);
        updateSoilMoistureIndicator(data.soilMoisture || 0);

        // Update charts dengan mode 'none' untuk skip animation
        updateCharts();

        isUpdating = false;

        // Process queued updates
        if (updateQueue.length > 0) {
            const queuedData = updateQueue.shift();
            setTimeout(() => updateDashboard(queuedData), 50);
        }
    });
}

// ⚡ Batch UI updates untuk mengurangi reflow
function batchUpdateUI(data) {
    // Update semua text content sekaligus
    const updates = [
        { id: 'gasValue', value: data.gas || 0 },
        { id: 'tempValue', value: (data.temperature || 0).toFixed(1) },
        { id: 'soilMoistureValue', value: (data.soilMoisture || 0).toFixed(1) },
        { id: 'gasChartValue', value: `${data.gas || 0} ppm` },
        { id: 'tempChartValue', value: `${(data.temperature || 0).toFixed(1)}°C` },
        { id: 'soilMoistureChartValue', value: `${(data.soilMoisture || 0).toFixed(1)}%` }
    ];

    updates.forEach(update => {
        const element = document.getElementById(update.id);
        if (element) {
            element.textContent = update.value;
            // Hanya add animation class untuk nilai utama
            if (['gasValue', 'tempValue', 'soilMoistureValue'].includes(update.id)) {
                element.classList.remove('value-update');
                void element.offsetWidth; // Trigger reflow
                element.classList.add('value-update');
            }
        }
    });
}

// ===== Alarm Sound System =====
let alarmAudio = null;
let alarmActive = false;

// Inisialisasi alarm sound menggunakan Web Audio API
function initAlarmSound() {
    if (alarmAudio) return;

    // Buat audio context untuk generate beep sound
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
        alarmAudio = new AudioContext();
        console.log('Alarm sound initialized');
    }
}

// Mainkan alarm sound
function playAlarm() {
    if (!alarmAudio) {
        initAlarmSound();
    }

    if (!alarmAudio || alarmActive) return;

    alarmActive = true;

    // Play beep sound sequence
    const playBeep = () => {
        if (!alarmActive || !alarmAudio) return;

        const oscillator = alarmAudio.createOscillator();
        const gainNode = alarmAudio.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(alarmAudio.destination);

        // Frequency: 800Hz (ting)
        oscillator.frequency.value = 800;
        oscillator.type = 'square';

        // Volume: 0.3 (tidak terlalu keras)
        gainNode.gain.setValueAtTime(0.3, alarmAudio.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, alarmAudio.currentTime + 0.3);

        // Durasi: 300ms beep, 200ms silence
        oscillator.start(alarmAudio.currentTime);
        oscillator.stop(alarmAudio.currentTime + 0.3);

        // Ulangi setiap 500ms
        setTimeout(playBeep, 500);
    };

    playBeep();
    console.log('Alarm started');
}

// Stop alarm sound
function stopAlarm() {
    if (alarmActive) {
        alarmActive = false;
        console.log('Alarm stopped');
    }
}

function updateValue(elementId, value) {
    const element = document.getElementById(elementId);
    element.textContent = value;
    element.classList.remove('value-update');
    void element.offsetWidth; // Trigger reflow
    element.classList.add('value-update');
}

// ⚡ Cache indicator bars untuk performa
let gasIndicatorBars = null;
let soilMoistureIndicatorBars = null;

function updateGasIndicator(value) {
    if (!gasIndicatorBars) {
        const indicator = document.getElementById('gasIndicator');
        gasIndicatorBars = indicator.querySelectorAll('.indicator-bar');
    }

    const level = Math.min(5, Math.ceil(value / (gasThreshold / 5)));

    gasIndicatorBars.forEach((bar, index) => {
        bar.classList.remove('active', 'warning', 'danger');
        if (index < level) {
            if (value < gasThreshold * 0.5) {
                bar.classList.add('active');
            } else if (value < gasThreshold * 0.8) {
                bar.classList.add('warning');
            } else {
                bar.classList.add('danger');
            }
        }
    });
}

function updateThermometer(value) {
    if (!cachedElements.thermometerFill) {
        cachedElements.thermometerFill = document.getElementById('thermometerFill');
    }

    // Map temperature 0-50°C to 0-100%
    const percentage = Math.min(100, Math.max(0, (value / 50) * 100));
    cachedElements.thermometerFill.style.height = percentage + '%';

    // Update color based on temperature
    if (value < 20) {
        cachedElements.thermometerFill.style.background = 'linear-gradient(to top, #74b9ff, #0984e3)';
    } else if (value < 30) {
        cachedElements.thermometerFill.style.background = 'linear-gradient(to top, #fdcb6e, #ff7675)';
    } else {
        cachedElements.thermometerFill.style.background = 'linear-gradient(to top, #ff7675, #d63031)';
    }
}

function updateTempTrend(value) {
    const trend = document.getElementById('tempTrend');
    const icon = trend.querySelector('.trend-icon');
    const text = trend.querySelector('.trend-text');

    if (tempData.length > 1) {
        const prevValue = tempData[tempData.length - 2];
        const diff = value - prevValue;

        icon.classList.remove('up', 'down');
        if (diff > 0.5) {
            icon.classList.add('up');
            icon.textContent = '↑';
            text.textContent = 'Naik';
        } else if (diff < -0.5) {
            icon.classList.add('down');
            icon.textContent = '↓';
            text.textContent = 'Turun';
        } else {
            icon.textContent = '→';
            text.textContent = 'Stabil';
        }
    }
}

function updateSoilMoistureIndicator(value) {
    if (!soilMoistureIndicatorBars) {
        const indicator = document.getElementById('soilMoistureIndicator');
        soilMoistureIndicatorBars = indicator.querySelectorAll('.indicator-bar');
    }

    const level = Math.min(5, Math.ceil(value / 20));

    soilMoistureIndicatorBars.forEach((bar, index) => {
        bar.classList.remove('active', 'warning', 'danger');
        if (index < level) {
            if (value < 30) {
                bar.classList.add('danger');  // Tanah sangat kering
            } else if (value < 50) {
                bar.classList.add('warning'); // Tanah agak kering
            } else {
                bar.classList.add('active');  // Tanah lembab
            }
        }
    });
}

function trimDataArrays() {
    while (labels.length > maxDataPoints) {
        labels.shift();
        gasData.shift();
        tempData.shift();
        soilMoistureData.shift();
    }
}

function updateCharts() {
    // ⚡ Use 'none' mode untuk skip animation - lebih cepat untuk real-time
    if (gasChart) gasChart.update('none');
    if (tempChart) tempChart.update('none');
    if (soilMoistureChart) soilMoistureChart.update('none');
}

// ===== Alert System =====
function showAlert(message) {
    const alertBanner = document.getElementById('alertBanner');
    const alertMessage = document.getElementById('alertMessage');

    alertMessage.textContent = message;
    alertBanner.classList.add('show');
}

function hideAlert() {
    const alertBanner = document.getElementById('alertBanner');
    alertBanner.classList.remove('show');
    // Stop alarm saat alert ditutup
    stopAlarm();
}

// ===== Logging System =====
function addLog(type, message) {
    const logContent = document.getElementById('logContent');
    const timestamp = new Date().toLocaleTimeString('id-ID');

    const logItem = document.createElement('div');
    logItem.className = `log-item log-${type}`;
    logItem.innerHTML = `
        <span class="log-time">${timestamp}</span>
        <span class="log-message">${message}</span>
    `;

    logContent.insertBefore(logItem, logContent.firstChild);

    // Keep only last 100 logs
    while (logContent.children.length > 100) {
        logContent.removeChild(logContent.lastChild);
    }

    // Also output to browser console for debugging
    console.log(`[${type.toUpperCase()}] ${timestamp}: ${message}`);
}

function clearLog() {
    const logContent = document.getElementById('logContent');
    logContent.innerHTML = `
        <div class="log-item log-info">
            <span class="log-time">--:--:--</span>
            <span class="log-message">Log dibersihkan.</span>
        </div>
    `;
    addLog('info', 'Log dibersihkan');
}

// ===== Handle Window Resize =====
window.addEventListener('resize', () => {
    if (gasChart) gasChart.resize();
    if (tempChart) tempChart.resize();
    if (soilMoistureChart) soilMoistureChart.resize();
});
