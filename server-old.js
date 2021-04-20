const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    return res.send({
        error: false,
        message: 'Welcome to my Dialogflow Webhook!',
        written_by: 'nGame'
    });
});

app.post('/lottery', (req, res) => {
    // console.log(req.body);

    let intent = req.body.queryResult.intent.displayName;
    let parameters = req.body.queryResult.parameters;
    let sessionId = req.body.session;
    console.log('Intent:', intent);
    console.log('SessionId:', sessionId);
    console.log('Parameters:', parameters);

    if (intent == 'getAllNumber') {
        connectToDatabase()
            .then((connection) => {
                return getAllNumber(connection)
                    .then((message) => {
                        res.send(createTextResponse(message));
                    });
            });
    } else if (intent == 'getLastNumber') {
        connectToDatabase()
            .then((connection) => {
                return getLastNumber(connection, parameters.lastNumber)
                    .then((message) => {
                        res.send(createTextResponse(message));
                    });
            });
    } else if (intent == 'buyLottery-Number') {
        connectToDatabase()
            .then((connection) => {
                return buyLottery(connection, parameters.lastNumber)
                    .then((message) => {
                        console.log(message);
                        res.send(createOutputContext(message.message, message.resultNumber, sessionId));
                    });
            });
    } else if (intent == 'buyLottery-Number-Yes-Email-Yes') {
        connectToDatabase()
            .then((connection) => {
                return getLotteryId(connection, parameters.lastNumber)
                    .then((lotteryId) => {
                        return updateLotteryStatus(connection, lotteryId)
                            .then(() => {
                                return addOrder(connection, lotteryId, parameters.email)
                                    .then((message) => {
                                        res.send(createTextResponse(message));
                                    });
                            });
                    });
            });
    }
});

function connectToDatabase() {
    const connection = mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: '',
        database: 'lottery',
        multipleStatements: true
    });

    return new Promise((resolve, reject) => {
        connection.connect();
        resolve(connection);
    });
}

function getAllNumber(connection) {
    return new Promise((resolve, reject) => {
        connection.query('SELECT * FROM tbl_lottery WHERE lottery_status = 1', (error, results, fields) => {
            if (error) throw error;

            let message = '';

            if (results == undefined || results.length == 0) {
                message = 'ตอนนี้ล็อตเตอรี่หมดค่ะ (ร้องไห้)';
            } else {
                results.forEach((result, i) => {
                    message = message + result.lottery_number;
                    if (i < results.length - 1) message = message + ',\n';
                });
            }
            resolve(message);
        });
    });
}

function getLastNumber(connection, lastNumber) {
    return new Promise((resolve, reject) => {
        connection.query(`SELECT * FROM tbl_lottery WHERE lottery_status = 1 AND lottery_number LIKE '%${lastNumber}'`, (error, results, fields) => {
            if (error) throw error;

            let message = '';

            if (lastNumber.toString().length > 6) {
                message = 'ดูเหมือนคุณพิมพ์เลขมาเกินนะ'
            } else {
                if (results == undefined || results.length == 0) {
                    message = `ล็อตเตอรี่เลขท้าย ${lastNumber} ไม่มีค่ะ (ร้องไห้)`;
                } else if (lastNumber.toString().length == 6) {
                    message = `ล็อตเตอรี่เลข ${lastNumber} ตอนนี้มีค่ะ`;
                } else {
                    results.forEach((result, i) => {
                        message += result.lottery_number;
                        if (i < results.length - 1) message += ',\n';
                    });
                }
            }
            resolve(message);
        });
    });
}

function buyLottery(connection, lastNumber) {
    return new Promise((resolve, reject) => {
        connection.query(`SELECT * FROM tbl_lottery WHERE lottery_status = 1 AND lottery_number LIKE '%${lastNumber}'`, (error, results, fields) => {
            if (error) throw error;

            let randomNumber = Math.floor(Math.random() * results.length);
            let message = '';
            let lotteryNumber = 0;

            if (results == undefined || results.length == 0) {
                message = 'ดูเหมือนเลขที่คุณพิมพ์มาจะไม่มีในคลังนะ! (ร้องไห้)';
            } else if (lastNumber.toString().length == 6) {
                message = `คุณต้องการเลข ${lastNumber} ใช่ไหมคะ?`;
                lotteryNumber = results[randomNumber].lottery_number
            } else {
                message = `เนื่องจากเลขท้าย ${lastNumber} นั้นมีหลายใบ เราเลยสุ่มเลข ${results[randomNumber].lottery_number} มาให้ คุณต้องการเลขนี้หรือไม่คะ?`;
                lotteryNumber = results[randomNumber].lottery_number;
            }
            resolve({
                    "message": message,
                    "resultNumber": lotteryNumber
                }
            );
        });
    });
}

function getLotteryId(connection, lastNumber) {
    return new Promise((resolve, reject) => {
        connection.query(`SELECT * FROM tbl_lottery WHERE lottery_number = ?`, [lastNumber], (error, results, fields) => {
            if (error) throw error;
            resolve(results[0].lottery_id);
        });
    });
}

function updateLotteryStatus(connection, lotteryId) {
    return new Promise((resolve, reject) => {
        connection.query(`UPDATE tbl_lottery SET lottery_status = 0 WHERE lottery_id = ?`, [lotteryId], (error, results, fields) => {
            if (error) throw error;
            resolve();
        });
    });
}

function addOrder(connection, lotteryId, email) {
    return new Promise((resolve, reject) => {
        connection.query(`INSERT INTO tbl_order (lottery_id, order_email) VALUES (?, ?)`, [lotteryId, email], (error, results, fields) => {
            if (error) throw error;

            let message = '';

            if (results == undefined || results.length == 0) {
                message = 'โอ๊ะ ดูเหมือนว่าบางอย่างผิดพลาด ลองใหม่อีกครั้งนะ!';
            } else {
                message = 'ยินดีด้วยเราได้ยืนยันการสั่งซื้อของคุณแล้ว กรุณาชำระเงินที่เลขบัญชี XXX-XXXXX-XX แล้วส่งมาทางอีเมล lottery-saler@somemail.com เพื่อยืนยันการชำระเงินค่ะ ขอบคุณค่ะ!'
            }

            resolve(message);
        });
    });
}

function createTextResponse(textResponse) {
    let response = {
        "fulfillmentMessages": [
            {
                "text": {
                    "text": [
                        textResponse
                    ]
                }
            }
        ]
    }
    return response;
}

function createOutputContext(textResponse, resultNumber, sessionId) {
    let contexts = '';

    resultNumber == 0 ? 'buyLottery-followup' : 'result-number';

    console.log(textResponse);

    let response = {
        "fulfillmentMessages": [
            {
                "text": {
                    "text": [
                        textResponse
                    ]
                }
            }
        ],
        "outputContexts": [
            {
                "name": `${sessionId}/contexts/${contexts}`,
                "lifespanCount": 5,
                "parameters": {
                    "lastNumber": resultNumber
                }
            }
        ]
    }
    return response;
}

app.listen(3000, () => {
    console.log('App is running on port 3000.');
});

module.exports = app;