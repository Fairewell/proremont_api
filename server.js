const express = require('express'); 
const bodyParser = require('body-parser'); 
const fs = require('fs'); 
const crypto = require('crypto'); 
const sqlite3 = require('sqlite3').verbose(); 
const cors = require("cors"); 
require('dotenv').config(); // Для загрузки переменных окружения 
const winston = require('winston');
const { log } = require('console');

const app = express(); 
app.use(cors()); 
const PORT = 3000;

// Функция для получения текущей даты и времени в нужном формате
function getCurrentTimestamp() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Конфигурация логгера
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console() // Для вывода в консоль
    ],
});

// Middleware для логгирования запросов
app.use((req, res, next) => {
    logger.info({
        message: `${req.method} ${req.url}`,
        body: req.body,
        timestamp: new Date().toISOString()
    });
    next();
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); // Разрешить все домены
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Чтение секретных ключей из файла 
const secretKeys = JSON.parse(fs.readFileSync('secret_keys.json', 'utf8')); 
// Используем фиксированный ключ и вектор инициализации (IV) 
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Должен быть 32 байта 
const IV = process.env.IV; // Должен быть 16 байтов 
const SERVER_CLOSE_CODE = process.env.SERVER_CLOSE_CODE;

// Функция для шифрования 
function encrypt(text) { 
    const algorithm = 'aes-256-cbc'; 
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(ENCRYPTION_KEY), Buffer.from(IV)); 
    let encrypted = cipher.update(text, 'utf8', 'hex'); 
    encrypted += cipher.final('hex'); 
    return encrypted; 
} 
// Функция для расшифрования 
function decrypt(text) { 
    const algorithm = 'aes-256-cbc'; 
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(IV, 'hex')); 
    let decrypted = decipher.update(text, 'hex', 'utf8'); 
    decrypted += decipher.final('utf8'); 
    logger.info(`   ENCRYPTED: ${text} | DECRYPTED: ${decrypted}`);
    return decrypted; 
} 
// Функция для открытия базы данных 
const openDB = () => { 
    return new sqlite3.Database('bd.db', (err) => { 
        if (err) { 
            console.error('Ошибка подключения к базе данных:', err.message); 
            throw err; // Пробрасываем ошибку, если не удалось подключиться 
        } else { 
            logger.info(`[openDB()] CONNECTION APPROVED`);
            console.log('Успешно подключено к базе данных'); 
        } 
    }); 
}; 

// Функция для получения текущей даты и времени в нужном формате
function getCurrentTimestamp() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Middleware для логгирования запросов
app.use((req, res, next) => {
    const timestamp = getCurrentTimestamp();
    console.log(`[${timestamp}] ${req.method} ${req.url} - REQUEST BODY: ${JSON.stringify(req.body)}`);
    next();
});


function saveData_DB() {
    return new Promise((resolve, reject) => {
        const db = openDB();
        db.serialize(() => {
            // Функция для вставки или обновления данных клиента
            const insertOrUpdateClient = (klient) => {
                return new Promise((resolve, reject) => {
                    const stmt = db.prepare(`INSERT INTO Klient (klient_id, fio, telefon) VALUES (?, ?, ?)`);
                    stmt.run(klient.klient_id, klient.fio, klient.telefon, function(err) {
                        if (err) {
                            if (err.message.includes("SQLITE_CONSTRAINT: UNIQUE")) {
                                const updateStmt = db.prepare(`UPDATE Klient SET fio = ?, telefon = ? WHERE klient_id = ?`);
                                updateStmt.run(klient.fio, klient.telefon, klient.klient_id, (updateErr) => {
                                    if (updateErr) {
                                        console.error("Ошибка при обновлении данных клиента:", updateErr.message);
                                        return reject(updateErr);
                                    }
                                    logger.info(`TABLE: Klient, UPDATE\UPDATE:${klient}`);
                                    resolve(); // Успешное обновление
                                });
                                updateStmt.finalize();
                            } else {
                                console.error("Ошибка при вставке данных клиента:", err.message);
                                reject(err); // Отклоняем промис при ошибке
                            }
                        } else {
                            logger.info(`TABLE: Klient, INSERT\nINSERT:${klient}`);
                            resolve(); // Успешная вставка
                        }
                    });
                    stmt.finalize();
                });
            };

            // Функция для вставки или обновления данных калькулятора
            const insertOrUpdateCalculator = (status) => {
                return new Promise((resolve, reject) => {
                    const stmt = db.prepare(`INSERT INTO Calculator (calculator_id, title, selected_option, all_price) VALUES (?, ?, ?, ?)`);
                    stmt.run(status.calculator_id, status.title, status.selected_option, status.all_price, function(err) {
                        if (err) {
                            if (err.message.includes("SQLITE_CONSTRAINT")) {
                                const updateStmt = db.prepare(`UPDATE Calculator SET title = ?, selected_option = ?, all_price = ? WHERE calculator_id = ?`);
                                updateStmt.run(status.title, status.selected_option, status.all_price, status.calculator_id, (updateErr) => {
                                    if (updateErr) {
                                        console.error("Ошибка при обновлении данных калькулятора:", updateErr.message);
                                        return reject(updateErr);
                                    }
                                    logger.info(`TABLE: CALCULATOR, UPDATE\UPDATE:${status}`);
                                    //console.log(`TABLE: CALCULATOR, UPDATE\UPDATE:${status}`);
                                    resolve(); // Успешное обновление
                                });
                                updateStmt.finalize();
                            } else {
                                console.error("Ошибка при вставке данных калькулятора:", err.message);
                                reject(err);
                            }
                        } else {
                            logger.info(`TABLE: CALCULATOR, INSERT\nUPDATED:${status}`);
                            //console.log(`TABLE: CALCULATOR, INSERT\nUPDATED:${status}`);
                            resolve(); // Успешная вставка
                        }
                    });
                    stmt.finalize();
                });
            };

            // Функция для вставки или обновления заявок
            const insertOrUpdateRequest = (type) => {
                return new Promise((resolve, reject) => {
                    // Проверяем, есть ли хотя бы одно значение null или пустая строка 
                    if (Object.values(type).some(value => value === null || value === "")) {
                        const deleteStmt = db.prepare(`DELETE FROM Request WHERE request_id = ?`);
                        deleteStmt.run(type.request_id, (deleteErr) => {
                            if (deleteErr) {
                                console.error("Ошибка при удалении данных заявки:", deleteErr.message);
                                return reject(deleteErr);
                            }
                            console.log(`TABLE: Request, DELETE\nDELETED request_id: ${type.request_id}`);
                            resolve(); // Успешное удаление
                        });
                        deleteStmt.finalize();
                        return; // Завершаем выполнение функции
                    }
            
                    const stmt = db.prepare(`INSERT INTO Request (request_id, klient_id, start_date, status_id, calculator_id, request_type_id, comment) VALUES (?, ?, ?, ?, ?, ?, ?)`);
                    stmt.run(type.request_id, type.klient_id, type.start_date, type.status_id, type.calculator_id, type.request_type_id, type.comment, function(err) {
                        if (err) {
                            if (err.message.includes("SQLITE_CONSTRAINT")) {
                                const updateStmt = db.prepare(`UPDATE Request SET klient_id = ?, start_date = ?, status_id = ?, calculator_id = ?, request_type_id = ?, comment = ? WHERE request_id = ?`);
                                updateStmt.run(type.klient_id, type.start_date, type.status_id, type.calculator_id, type.request_type_id, type.comment, type.request_id, (updateErr) => {
                                    if (updateErr) {
                                        console.error("Ошибка при обновлении данных заявки:", updateErr.message);
                                        return reject(updateErr);
                                    }
                                    logger.info(`TABLE: Request, UPDATED\nUPDATED:${JSON.stringify(type)}`);
                                    resolve(); // Успешное обновление
                                });
                                updateStmt.finalize();
                            } else {
                                console.error("Ошибка при вставке данных заявки:", err.message);
                                reject(err);
                            }
                        } else {
                            logger.info(`TABLE: Request, INSERT\nINSERT:${JSON.stringify(type)}`);
                            resolve(); // Успешная вставка
                        }
                    });
                    stmt.finalize();
                });
            };
            
            // Функция для вставки или обновления заявок
            const insertOrUpdateWorker = (work) => {
                return new Promise((resolve, reject) => {
                    const stmt = db.prepare(`INSERT INTO Worker (worker_id, fio, speciality_id, position_id) VALUES (?, ?, ?, ?)`);
                    stmt.run(work.request_id, work.klient_id, work.start_date, work.status_id, work.calculator_id, work.request_type_id, function(err) {
                        if (err) {
                            if (err.message.includes("SQLITE_CONSTRAINT")) {
                                const updateStmt = db.prepare(`UPDATE Worker SET fio = ?, speciality_id = ?, position_id = ? WHERE worker_id = ?`);
                                updateStmt.run(work.fio, work.speciality_id, work.position_id, work.worker_id, (updateErr) => {
                                    if (updateErr) {
                                        console.error("Ошибка при обновлении данных заявки:", updateErr.message);
                                        return reject(updateErr);
                                    }
                                    logger.info(`TABLE: Worker, UPDATE\nUPDATED:${work}`);
                                    console.log(`TABLE: Worker, UPDATE\nUPDATED:${work}`);
                                    resolve(); // Успешное обновление
                                });
                                updateStmt.finalize();
                            } else {
                                console.error("Ошибка при вставке данных заявки:", err.message);
                                reject(err);
                            }
                        } else {
                            logger.info(`TABLE: Worker, INSERT\nINSERTED:${work}`);
                            console.log(`TABLE: Worker, INSERT\nINSERTED:${work}`);
                            resolve(); // Успешная вставка
                        }
                    });
                    stmt.finalize();
                });
            };

            // Обработка вставки или обновления клиентов
            const clientPromises = allDB_data.Klient.map(klient => insertOrUpdateClient(klient));
            Promise.all(clientPromises)
                .then(() => {
                    // Обработка вставки или обновления калькуляторов
                    const calculatorPromises = allDB_data.Calculator.map(status => insertOrUpdateCalculator(status));
                    return Promise.all(calculatorPromises);
                })
                .then(() => {
                    // Обработка вставки или обновления заявок
                    const requestPromises = allDB_data.Request.map(type => insertOrUpdateRequest(type));
                    return Promise.all(requestPromises);
                })
                .then(() => {
                    // Обработка вставки или обновления рабочих
                    const workerPromises = allDB_data.Worker.map(work => insertOrUpdateRequest(work));
                    return Promise.all(workerPromises);
                })
                .then(() => {
                    // Закрытие базы данных
                    db.close(err => {
                        if (err) {
                            console.error('Ошибка при закрытии базы данных:', err.message);
                            reject(err);
                        } else {
                            console.log('База данных успешно закрыта.');
                            resolve(); // Разрешаем промис после успешного завершения
                        }
                    });
                })
                .catch(err => {
                    reject(err); // Обработка ошибок
                });
        });
    });
}

// Сохранить все данные из БД в массиве allDB_data 
let allDB_data = {}; 
function serialize_bd() { 
    const db = openDB(); 
    let serDB = {}; 
    // Запрашиваем имена таблиц и данные из каждой из них 
    db.serialize(() => { 
        db.all(`SELECT name FROM sqlite_master WHERE type='table';`, [], (err, tables) => { 
            if (err) { 
                
                console.error('Ошибка при получении таблиц:', err.message); 
                db.close(); // Закрываем соединение, если произошла ошибка 
                return; 
            } 
            let completedRequests = 0; // Счетчик завершенных запросов 
            // Для каждой таблицы получаем данные 
            tables.forEach((table) => { 
                db.all(`SELECT * FROM ${table.name};`, [], (err, rows) => { 
                    completedRequests++; // Увеличиваем счетчик завершенных запросов 
            
                    if (err) { 
                        console.error(`Ошибка при получении данных из таблицы ${table.name}:`, err.message); 
                    } else { 
                        // Предположим, что n - это индекс строки, которую мы хотим проверить
                        const n = 0; // Замените 0 на нужный индекс строки
            
                        // Проверяем, есть ли пустые значения в строке n
                        if (n < rows.length) { // Проверяем, что индекс n не выходит за пределы массива
                            const hasEmptyValueInRowN = Object.values(rows[n]).some(value => value === null || value === '');
            
                            // Выводим результат
                            if (hasEmptyValueInRowN) {
                                console.log(`[CHECK] В строке ${n} таблицы ${table.name} есть пустое значение.`);
                            } else {
                                console.log(`[CHECK] В строке ${n} таблицы ${table.name} пустых значений нет.`);
                            }
                        } else {
                            console.log(`[CHECK] Индекс ${n} выходит за пределы массива строк таблицы ${table.name}.`);
                        }
            
                        // Фильтруем строки, удаляя те, где значения null
                        const filteredRows = rows.filter(row => {
                            return Object.values(row).every(value => value !== null && value !== '');
                        });
            
                        // Сохраняем данные в массиве 
                        allDB_data[table.name] = filteredRows; 
                        serDB[table.name] = filteredRows; 
                    } 
            
                    // Закрываем соединение, когда все запросы завершены 
                    if (completedRequests === tables.length) { 
                        console.log('Данные из всех таблиц:', allDB_data); 
                        db.close((err) => { 
                            if (err) { 
                                console.error('Ошибка при закрытии базы данных:', err.message); 
                            } else { 
                                console.log('Соединение с базой данных закрыто.'); 
                            } 
                        }); 
                    } 
                }); 
            });
            // Если нет таблиц, закрываем соединение 
            if (tables.length === 0) { 
                db.close((err) => { 
                    if (err) { 
                        console.error('Ошибка при закрытии базы данных:', err.message); 
                    } else { 
                        console.log('Соединение с базой данных закрыто.'); 
                    } 
                }); 
            } 
        }); 
    }); 
}
// Middleware для парсинга JSON 
app.use(bodyParser.json()); 

app.get('/get-data', (req, res) => {

    const data = JSON.parse(fs.readFileSync('./data.json', 'utf8')); 
    
    // Извлечение параметров из запроса
    const requestType = req.query.request_type;
    const secretTokenEncryptedData = req.query.secretTokenEncryptedData;
    const secretTokenIV = req.query.secretTokenIV;

    // Проверка на наличие токена и его значение
    if (!secretTokenEncryptedData || !secretTokenIV) { 
        return res.status(400).json({ message: 'Токен не предоставлен или неполный' }); 
    } 
    // Проверяем каждый секретный ключ 
    for (const key of secretKeys) { 
        try { 
            const decryptedString = decrypt(secretTokenEncryptedData); 
            if (decryptedString === key.secretstring) { 
                if (!data || Object.keys(data).length === 0) {
                        return res.status(500).json({ message: 'Данные пусты, используйте заготовленные данные на своей стороне' });
                }
                if (requestType == 0){
                    responseData = data.advantages; // Возвращаем projects
                } else if (requestType == 1) {
                    responseData = data.projects; // Возвращаем projects
                }else {
                    return res.status(400).json({ message: 'Неверный request_type' });
                }
            
                console.warn(`[GET] catalog-data. TIME: ${new Date().toISOString()}`);
                return res.status(200).json(responseData); // Возвращаем выбранные данные
            } 
        } catch (error) { 
            console.error('Ошибка при расшифровке:', error); 
            return res.status(500).json({ message: 'Ошибка сервера' }); 
        } 
    }
});

// Эндпоинт для проверки токена 
app.post('api/check-token', (req, res) => { 
    const { secretToken } = req.body; 
    // Проверка наличия токена 
    if (!secretToken || !secretToken.encryptedData || !secretToken.iv) { 
        return res.status(400).json({ message: 'Токен не предоставлен или неполный' }); 
    } 
    // Проверяем каждый секретный ключ 
    for (const key of secretKeys) { 
        try { 
            const decryptedString = decrypt(secretToken.encryptedData); 
            if (decryptedString === key.secretstring) { 
                return res.status(200).json({ message: 'Доступ разрешен', user: key.name }); 
            } 
        } catch (error) { 
            console.error('Ошибка при расшифровке:', error); 
            return res.status(500).json({ message: 'Ошибка сервера' }); 
        } 
    } 
    return res.status(403).json({ message: 'Доступ запрещен' }); 
}); 
app.post('/submit-request', (req, res) => { //Feedback, request 
    const { request_type, secretToken, requestData } = req.body; 
    if (!secretToken || !secretToken.encryptedData || !secretToken.iv) { 
        return res.status(400).json({ message: 'Токен не предоставлен или неполный' }); 
    } 
    let numberOfElements; 
    let user = null; 
    for (const key of secretKeys) { 
        try { 
            const decryptedString = decrypt(secretToken.encryptedData); 
            if (decryptedString === key.secretstring) { 
                user = key; 
                break; 
            } 
        } catch (error) { 
            console.error('Ошибка при расшифровке:', error); 
            return res.status(500).json({ message: 'Ошибка сервера.' }); 
        } 
    } 
    if (!user) { 
        return res.status(403).json({ message: 'Доступ запрещен. Токен не соотвествует.' }); 
    } 
    var date = new Date();
    let request; 
    if (request_type === 0) { 
        request = { 
            req_calculator: requestData.calculator, 
            comment: requestData.comment, 
            date: requestData.date, 
            name: requestData.fio, 
            numbers: requestData.nomer_telefona, 
            type: requestData.type, 
            status: requestData.zayavka_status 
        }; 
        console.log(request); 
        const klient = { 
            klient_id: allDB_data.Klient.length + 1, 
            fio: request.name, 
            telefon: request.numbers 
        }; 
        let selected_Options = [];
        // Обработка выбранных опций 
        request.req_calculator.forEach(req => { 
            if (req.selected_products) { // Проверяем, существует ли selected_products 
                req.selected_products.forEach(opt => { 
                    const option = { 
                        title: opt.title, 
                        price: opt.price 
                    };
                    selected_Options.push(option);
                }); 
                
            } 
        }); 
        console.log(request.req_calculator); 
        console.log(selected_Options); 
        const resultString = selected_Options.map(item => `${item.title}: ${item.price}`).join(', ');
        console.log(resultString);
        // Создание объекта Calculator 
        const Calculator = { 
            calculator_id: allDB_data.Calculator.length + 1,
            selected_option: resultString,
            title: request.req_calculator[0].title,
            all_price: request.req_calculator[0].all_price 
        }; 
        var date = getCurrentTimestamp();
        console.log(Calculator); 
        allDB_data.Klient.push(klient); 
        allDB_data.Calculator.push(Calculator); // Добавляем первый калькулятор 
        const Request = { 
            request_id: allDB_data.Request.length + 1, 
            klient_id: allDB_data.Klient.length, 
            start_date: date, 
            status_id: 0, 
            calculator_id: allDB_data.Calculator.length, // Исправлено с allDB_data на allDB_data 
            request_type_id: 2, 
            comment:"коммент",
        }; 
        allDB_data.Request.push(Request); 
        console.log(Request); 
        console.log(`klients: ${allDB_data.Klient}`); 
        console.log(`requests: ${allDB_data.Request}`); 
    } 
    else if (request_type == 2){ 
        console.log(`get request type: ${request_type}`);
        request = { 
            fio: requestData.firstname + requestData.name + requestData.secondname,     
            numbers: requestData.nomer_telefona,
            status: 0
        } 
        const klient = { 
            klient_id: allDB_data.Klient.length + 1, 
            fio: request.fio, 
            telefon: request.numbers 
        }; 
        allDB_data.Klient.push(klient); 
        console.log(`klient: ${klient}`);
    } 
    else if (request_type == 1){ 
        console.log(`get request type: ${request_type}`)
        request = { 
            fio: requestData.firstname + requestData.name + requestData.secondname,  
            numbers: requestData.nomer_telefona, 
            comment: requestData.comment
        } 
        const worker = {
            worker_id: allDB_data.Worker.length + 1,
            fio: request.fio,
            speciality_id: 1,
            position_id: 1
        }
        allDB_data.Worker.push(worker);
        console.log(`worker: ${worker}`);
    } 
    if (!request){ 
        res.status(500).json({message: "Ошибка сервера."}); 
    } 
    else { 
        saveData_DB();
        console.log(`request: ${request}`); 
        res.status(200).json({message: "Заявка получена."}) 
    } 
}); 
app.get('/get-bd', (req, res) => { 
    const { secretToken } = req.body; // Используем secretToken из строки запроса 
    if (!secretToken || !secretToken.encryptedData || !secretToken.iv) { 
        return res.status(400).json({ message: 'Токен не предоставлен или неполный' }); 
    } 
    let user = null; 
    for (const key of secretKeys) { 
        try { 
            const decryptedString = decrypt(secretToken.encryptedData); 
            if (decryptedString === key.secretstring) { 
                user = key; 
                break; 
            } 
        } catch (error) { 
            console.error('[GET BD]: Ошибка при расшифровке:', error); 
            return res.status(500).json({ message: 'Ошибка сервера.' }); 
        } 
    } 
    if (!user) { 
        return res.status(403).json({ message: 'Доступ запрещен. Токен несоответствует.' }); 
    } 
    try { 
        if (user.access_level < 4) { 
            return res.status(403).json({ message: "Доступ запрещен. Нет доступа." }); 
        } 
    } catch (error) { 
        console.error('[GET BD]: Ошибка при проверке доступа:', error); 
        return res.status(500).json({ message: 'Ошибка сервера. Ошибка доступа.' }); 
    } 
    var date = new Date(); 
    console.log(allDB_data);
    
    console.log(`[GET BD]: Access granted. Time: ${date.getHours()}, user: ${user.name}`); 
    return res.status(200).json(allDB_data); 
}); 
app.post('/upload-bd', (req, res) => { 
    const { secretToken, allData } = req.body; // Используем secretToken из строки запроса 
    if (!secretToken || !secretToken.encryptedData || !secretToken.iv) { 
        return res.status(400).json({ message: 'Токен не предоставлен или неполный' }); 
    } 
    if (!allData) { 
        return res.status(400).json({msg: 'Датабэйз не отправлен еблан, заново.'}); 
    } 
    let user = null; 
    for (const key of secretKeys) { 
        try { 
            const decryptedString = decrypt(secretToken.encryptedData); 
            if (decryptedString === key.secretstring) { 
                user = key; 
                break; 
            } 
        } catch (error) { 
            console.error('Ошибка при расшифровке:', error); 
            return res.status(500).json({ message: 'Ошибка сервера.' }); 
        } 
    } 
    if (!user) { 
        return res.status(403).json({ message: 'Доступ запрещен. Токен несоответствует.' }); 
    } 
    try { 
        if (user.access_level < 4) { 
            return res.status(403).json({ message: "Доступ запрещен. Нет доступа." }); 
        } 
    } catch (error) { 
        console.error('Ошибка при проверке доступа:', error); 
        return res.status(500).json({ message: 'Ошибка сервера. Ошибка доступа.' }); 
    } 
    var date = new Date(); 
    console.log(`[POST_UP]: Access granted. Time: ${date.getHours()}, user: ${user.name}`); 
    console.log('[POST_UP]: ...Данные сохранены');
                        allDB_data = allData;
                        return res.status(200).json({msg : `Access granted. Time: ${date.getHours()}, user: ${user.name}. Server be closed in few seconds.`})
}); 

app.post('/close-server', (req, res) => {
    const { secretToken, data } = req.body; // Используем secretToken из строки запроса 
    if (!secretToken || !secretToken.encryptedData || !secretToken.iv) { 
        return res.status(400).json({ message: 'Токен не предоставлен или неполный' }); 
    } 
    let user = null; 
    for (const key of secretKeys) { 
        try { 
            const decryptedString = decrypt(secretToken.encryptedData); 
            if (decryptedString === key.secretstring) { 
                user = key; 
                break; 
            } 
        } catch (error) { 
            console.error('[POST_CLOSED]: Ошибка при расшифровке:', error); 
            return res.status(500).json({ message: 'Ошибка сервера.' }); 
        } 
    } 
    if (!user) { 
        return res.status(403).json({ message: 'Доступ запрещен. Токен несоответствует.' }); 
    } 
    try { 
        if (user.access_level < 4) { 
            return res.status(403).json({ message: "Доступ запрещен. Нет доступа." }); 
        } 
    } catch (error) { 
        console.error('[POST_CLOSED]: Ошибка при проверке доступа:', error); 
        return res.status(500).json({ message: 'Ошибка сервера. Ошибка доступа.' }); 
    }
    if (!data) { 
        return res.status(400).json({msg: 'Code is not be posted. Check request and try again.'}); 
    }
    else{
        const decryptedString = decrypt(data.code);
        if (decryptedString === SERVER_CLOSE_CODE) {
            try {
                const decryptedString = decrypt(data.code);
                if (decryptedString === SERVER_CLOSE_CODE) {
                    var date = new Date(); 
                    console.log(`Access granted. Time: ${date.getHours()}, user: ${user.name}. SERVER CLOSE CODE GET: ${data.code}`);
                    saveData_DB()
                    .then(() => {
                        console.log('[POST_CLOSED]: ...Данные сохранены');
                        return res.status(200).json({msg : `Access granted. Time: ${date.getHours()}, user: ${user.name}. Server be closed in few seconds.`})
                        .then(() => {
                            process.exit();
                        })
                    })
                    .catch(err => {
                        console.error('Ошибка при сохранении данных:', err);
                        return res.status(400).json({msg: `Access granted? y. Data be saved? n. ERROR IN SAVE_BD: ${err}. Server be closed in few seconds.`})
                        .then(() => {
                            process.exit(1);
                        })
                    });

                } else {
                    return res.status(400).json({msg: 'Code is not be matched. Check request and try again.'}); 
                }
            } catch (error) {
                console.error('[POST_CLOSED]: Ошибка при расшифровке:', error); 
                return res.status(500).json({ message: 'Ошибка сервера.' }); 
            }
        }
    }
});

// Обработка сигнала SIGINT 
process.on('SIGINT', () => { 
    console.log('Получен сигнал завершения. Сохраняем данные...'); 
    saveData_DB()
    .then(() => {
        console.log('...Данные сохранены');
        process.exit();
    })
    .catch(err => {
        console.error('Ошибка при сохранении данных:', err);
        process.exit(1); // Завершение процесса 
    });
    process.exitCode = 1; // Завершение процесса 
}); 

//

const server = app.listen(PORT, () => { 
    const addressInfo = server.address(); // Адрес сервера 
    serialize_bd(); 
    console.log(`Сервер слушает на адресе ${addressInfo.address} и порту ${addressInfo.port} в режиме ${app.settings.env}`); 
});