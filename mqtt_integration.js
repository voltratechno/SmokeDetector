/**
 * MQTT Integration untuk Fire Detection System
 * Terhubung ke ESP32 dengan broker EMQX
 * Topik MQTT sesuai dengan kode ESP32
 */

// ===== KONFIGURASI MQTT =====
const MQTT_CONFIG = {
    // EMQX Public Broker
    host: 'broker.emqx.io',
    port: 8084,  // WebSocket Secure (WSS) port untuk HTTPS
    path: '/mqtt',

    // Topik MQTT (sesuai kode ESP32)
    topics: {
        data: 'sensor/fire/data',           // Single JSON topic (baru, lebih efisien)
        temperature: 'sensor/fire/temperature',
        gas: 'sensor/fire/gas',
        soil: 'sensor/fire/soil',
        status: 'sensor/fire/status',
        alarm: 'sensor/fire/alarm'
    },

    // Mode: true = gunakan single JSON topic, false = gunakan multiple topics
    useSingleJsonTopic: true,  // Set true untuk mode baru (lebih real-time)

    options: {
        keepAliveInterval: 30,
        timeout: 10,
        useSSL: true,  // Gunakan SSL/WSS untuk HTTPS
        cleanSession: true,
        reconnect: true,
        reconnectInterval: 5000
    }
};

// ===== DATA BUFFER =====
// Simpan data terbaru dari setiap sensor
let sensorData = {
    temperature: 0,
    gas: 0,
    soilMoisture: 0,
    status: 'AMAN',
    alarm: 0,
    // Flag untuk melacak data mana yang sudah diterima
    received: {
        temperature: false,
        gas: false,
        soil: false
    }
};

// ===== MQTT SERVICE CLASS =====
class MQTTService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.clientId = 'fire-detector-web-' + Math.random().toString(16).substr(2, 8);

        console.log('MQTT Service initialized');
        console.log('Client ID:', this.clientId);
    }

    // Inisialisasi koneksi MQTT
    init() {
        if (this.isConnected) {
            console.log('MQTT already connected');
            return;
        }

        console.log('Menghubungkan ke MQTT broker...');
        console.log('Host:', MQTT_CONFIG.host);
        console.log('Port:', MQTT_CONFIG.port);

        try {
            // Create Paho MQTT client
            this.client = new Paho.MQTT.Client(
                MQTT_CONFIG.host,
                MQTT_CONFIG.port,
                MQTT_CONFIG.path,
                this.clientId
            );

            // Set callback handlers
            this.client.onConnectionLost = (responseObject) => {
                this.onConnectionLost(responseObject);
            };

            this.client.onMessageArrived = (message) => {
                this.onMessageArrived(message);
            };

            // Connect options
            const connectOptions = {
                keepAliveInterval: MQTT_CONFIG.options.keepAliveInterval,
                timeout: MQTT_CONFIG.options.timeout,
                useSSL: MQTT_CONFIG.options.useSSL,
                cleanSession: MQTT_CONFIG.options.cleanSession,
                onSuccess: () => {
                    this.onConnect();
                },
                onFailure: (error) => {
                    this.onFailure(error);
                }
            };

            // Connect to broker
            this.client.connect(connectOptions);

        } catch (error) {
            console.error('Error initializing MQTT:', error);
            this.updateMQTTStatus(false);
            this.logError('Gagal inisialisasi MQTT: ' + error.message);
        }
    }

    // Handler saat koneksi berhasil
    onConnect() {
        console.log('✓ MQTT Connected!');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // Update UI status
        this.updateMQTTStatus(true);

        // Subscribe ke semua topik
        this.subscribeToTopics();

        // Update connect button
        const connectBtn = document.getElementById('connectMQTTBtn');
        if (connectBtn) {
            connectBtn.textContent = 'Terhubung ✓';
            connectBtn.classList.remove('btn-success');
            connectBtn.classList.add('btn-secondary');
        }

        this.logSuccess('Berhasil terhubung ke broker MQTT!');
        this.logInfo('Menunggu data sensor dari ESP32...');
    }

    // Subscribe ke semua topik sensor
    subscribeToTopics() {
        if (MQTT_CONFIG.useSingleJsonTopic) {
            // Mode baru: hanya subscribe ke single JSON topic
            this.client.subscribe(MQTT_CONFIG.topics.data, {
                qos: 0,
                onSuccess: () => {
                    console.log('✓ Subscribed to single JSON topic:', MQTT_CONFIG.topics.data);
                },
                onFailure: (error) => {
                    console.error('✗ Failed to subscribe:', MQTT_CONFIG.topics.data, error);
                }
            });
        } else {
            // Mode lama: subscribe ke semua topik terpisah
            const topics = [
                MQTT_CONFIG.topics.temperature,
                MQTT_CONFIG.topics.gas,
                MQTT_CONFIG.topics.soil,
                MQTT_CONFIG.topics.status,
                MQTT_CONFIG.topics.alarm
            ];

            topics.forEach(topic => {
                this.client.subscribe(topic, {
                    qos: 0,
                    onSuccess: () => {
                        console.log('✓ Subscribed to:', topic);
                    },
                    onFailure: (error) => {
                        console.error('✗ Failed to subscribe:', topic, error);
                    }
                });
            });
        }
    }

    // Handler saat koneksi terputus
    onConnectionLost(responseObject) {
        console.log('MQTT Connection lost:', responseObject);
        this.isConnected = false;

        if (responseObject.errorCode !== 0) {
            this.updateMQTTStatus(false);
            this.logError('Koneksi MQTT terputus: ' + responseObject.errorMessage);

            // Update connect button
            const connectBtn = document.getElementById('connectMQTTBtn');
            if (connectBtn) {
                connectBtn.textContent = 'Hubungkan MQTT';
                connectBtn.classList.remove('btn-secondary');
                connectBtn.classList.add('btn-success');
                connectBtn.disabled = false;
            }

            // Auto reconnect
            if (MQTT_CONFIG.options.reconnect) {
                this.attemptReconnect();
            }
        } else {
            this.logInfo('Koneksi MQTT ditutup dengan normal');
        }
    }

    // Handler saat koneksi gagal
    onFailure(error) {
        console.error('MQTT Connection failed:', error);
        this.updateMQTTStatus(false);
        this.logError('Gagal terhubung ke MQTT broker');

        // Update connect button
        const connectBtn = document.getElementById('connectMQTTBtn');
        if (connectBtn) {
            connectBtn.textContent = 'Hubungkan MQTT';
            connectBtn.classList.remove('btn-secondary');
            connectBtn.classList.add('btn-success');
            connectBtn.disabled = false;
        }

        // Auto reconnect
        if (MQTT_CONFIG.options.reconnect) {
            this.attemptReconnect();
        }
    }

    // Attempt to reconnect
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = MQTT_CONFIG.options.reconnectInterval;

            this.logInfo(`Mencoba reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.init();
            }, delay);
        } else {
            this.logError('Gagal reconnect setelah ' + this.maxReconnectAttempts + ' percobaan');
        }
    }

    // Handler saat pesan diterima
    onMessageArrived(message) {
        // Paho MQTT menggunakan destinationName, bukan topic
        const topic = message.destinationName;
        const payload = message.payloadString;

        console.log('📩 Message:', topic, '=', payload);

        try {
            // MODE BARU: Single JSON topic (lebih efisien dan real-time)
            if (MQTT_CONFIG.useSingleJsonTopic && topic === MQTT_CONFIG.topics.data) {
                // Parse JSON langsung
                const data = JSON.parse(payload);

                console.log('  → JSON Data received:');
                console.log('     - Gas:', data.gas, 'PPM');
                console.log('     - Temperature:', data.temperature, '°C');
                console.log('     - Soil Moisture:', data.soilMoisture, '%');
                console.log('     - Status:', data.status);
                console.log('     - Gas Alert:', data.gas_alert);

                // Update sensorData
                sensorData.gas = data.gas || 0;
                sensorData.temperature = data.temperature || 0;
                sensorData.soilMoisture = data.soilMoisture || 0;
                sensorData.alarm = data.gas_alert || 0;
                sensorData.status = data.status || 'AMAN';

                // Tampilkan alert bahaya dan mainkan alarm sound
                if (sensorData.alarm === 1) {
                    if (typeof showAlert === 'function') {
                        showAlert('⚠️ BAHAYA - ASAP TERDETEKSI!');
                    }
                    if (typeof playAlarm === 'function') {
                        playAlarm();
                    }
                    this.logWarning('Alarm diaktifkan dari ESP32');
                } else {
                    // Stop alarm jika alarm = 0
                    if (typeof stopAlarm === 'function') {
                        stopAlarm();
                    }
                }

                // Update dashboard SEKALI dengan data lengkap
                if (typeof updateDashboard === 'function') {
                    updateDashboard({
                        gas: sensorData.gas,
                        temperature: sensorData.temperature,
                        soilMoisture: sensorData.soilMoisture,
                        gas_alert: sensorData.alarm
                    });
                }
            }
            // MODE LAMA: Multiple topics (untuk kompatibilitas)
            else if (!MQTT_CONFIG.useSingleJsonTopic) {
                // Parse data berdasarkan topik
                if (topic === MQTT_CONFIG.topics.temperature) {
                    sensorData.temperature = parseFloat(payload);
                    sensorData.received.temperature = true;
                    console.log('  → Temperature:', sensorData.temperature, '°C');
                }
                else if (topic === MQTT_CONFIG.topics.gas) {
                    sensorData.gas = parseInt(payload);
                    sensorData.received.gas = true;
                    console.log('  → Gas:', sensorData.gas, 'PPM');
                }
                else if (topic === MQTT_CONFIG.topics.soil) {
                    sensorData.soilMoisture = parseInt(payload);
                    sensorData.received.soil = true;
                    console.log('  → Soil Moisture:', sensorData.soilMoisture, '%');
                }
                else if (topic === MQTT_CONFIG.topics.status) {
                    sensorData.status = payload;
                    console.log('  → Status:', sensorData.status);
                }
                else if (topic === MQTT_CONFIG.topics.alarm) {
                    sensorData.alarm = parseInt(payload);
                    console.log('  → Alarm:', sensorData.alarm);

                    // Tampilkan alert dan mainkan alarm sound jika alarm aktif
                    if (sensorData.alarm === 1) {
                        if (typeof showAlert === 'function') {
                            showAlert('⚠️ BAHAYA - ASAP TERDETEKSI!');
                        }
                        if (typeof playAlarm === 'function') {
                            playAlarm();
                        }
                        this.logWarning('Alarm diaktifkan dari ESP32');
                    } else {
                        // Stop alarm jika alarm = 0
                        if (typeof stopAlarm === 'function') {
                            stopAlarm();
                        }
                    }
                }

                // Update dashboard setiap kali menerima data sensor (real-time)
                if (typeof updateDashboard === 'function') {
                    updateDashboard({
                        gas: sensorData.gas,
                        temperature: sensorData.temperature,
                        soilMoisture: sensorData.soilMoisture,
                        gas_alert: sensorData.alarm
                    });
                }
            }

        } catch (error) {
            console.error('Error processing message:', error);
            this.logError('Gagal memproses pesan: ' + error.message);
        }
    }

    // Disconnect dari broker
    disconnect() {
        if (this.client && this.isConnected) {
            this.client.disconnect();
            this.isConnected = false;
            this.updateMQTTStatus(false);
            this.logInfo('Terputus dari MQTT broker');
        }
    }

    // Update MQTT status di UI
    updateMQTTStatus(connected) {
        const statusDot = document.querySelector('#mqttStatus .status-dot');
        const statusText = document.querySelector('#mqttStatus .status-text');

        if (statusDot && statusText) {
            if (connected) {
                statusDot.classList.add('active');
                statusText.textContent = 'MQTT Terhubung';
            } else {
                statusDot.classList.remove('active');
                statusText.textContent = 'MQTT Terputus';
            }
        }
    }

    // Logging helpers
    logSuccess(message) {
        if (typeof addLog === 'function') {
            addLog('success', message);
        }
    }

    logError(message) {
        if (typeof addLog === 'function') {
            addLog('error', message);
        }
    }

    logInfo(message) {
        if (typeof addLog === 'function') {
            addLog('info', message);
        }
    }

    logWarning(message) {
        if (typeof addLog === 'function') {
            addLog('warning', message);
        }
    }
}

// ===== TRIGGER KALIBRASI =====
// Fungsi untuk trigger kalibrasi di ESP32
MQTTService.prototype.triggerCalibration = function() {
    if (!this.isConnected) {
        this.logError('Hubungkan MQTT terlebih dahulu!');
        return false;
    }

    // Catatan: Kode ESP32 Anda saat ini tidak menerima perintah kalibrasi via MQTT
    // Kalibrasi hanya via Serial Monitor ('c' atau 'C')
    this.logInfo('Untuk kalibrasi: Buka Serial Monitor ESP32 dan ketik "c"');
    this.logInfo('Atau tambahkan subscribe topik kalibrasi di kode ESP32');

    return true;
};

// ===== GLOBAL INSTANCE =====
window.MQTTService = new MQTTService();

// Log saat file dimuat
console.log('========================================');
console.log('MQTT Integration Loaded');
console.log('Broker:', MQTT_CONFIG.host);
console.log('Mode:', MQTT_CONFIG.useSingleJsonTopic ? 'Single JSON Topic (Recommended)' : 'Multiple Topics');
console.log('Topics:');
if (MQTT_CONFIG.useSingleJsonTopic) {
    console.log('  -', MQTT_CONFIG.topics.data, '(JSON with all data)');
} else {
    console.log('  -', MQTT_CONFIG.topics.temperature);
    console.log('  -', MQTT_CONFIG.topics.gas);
    console.log('  -', MQTT_CONFIG.topics.soil);
    console.log('  -', MQTT_CONFIG.topics.status);
    console.log('  -', MQTT_CONFIG.topics.alarm);
}
console.log('========================================');
