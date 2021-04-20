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

// POST Request
app.post('/lottery', (req, res) => {
	let intent = req.body.queryResult.intent.displayName;
	let parameters = req.body.queryResult.parameters;
	let sessionId = req.body.session;

	console.log('Intent:', intent);
	console.log('SessionId:', sessionId);
	console.log('Parameters:', parameters);

	if (intent == 'getAllNumber') {
		return connectToDatabase()
			.then(connection => {
				return getAllNumber(connection)
					.then(message => {
						connection.end();
						res.send(createTextResponse(message));
					});
			});
	} else if (intent == 'getLastNumber') {
		return connectToDatabase()
			.then(connection => {
				return getLastNumber(connection, parameters.number, intent)
					.then(message => {
						connection.end();
						res.send(createTextResponse(message));
					});
			});
	} else if (intent == 'buyLottery-Number') {
		return connectToDatabase()
			.then(connection => {
				getLastNumber(connection, parameters.number, intent)
					.then(results => {
						connection.end();
						if (results.error) {
							res.send(createOutputContexts(results));
						} else {
							res.send(createOutputContexts(results));
						}
					});
			});
	} else if (intent == 'buyLottery-Number-Email - yes') {
		return connectToDatabase()
			.then(connection => {
				return updateLotteryStatus(connection, parameters.id, parameters.number)
					.then(results => {
						if (results.error) {
							connection.end();
							res.send(createOutputContexts(results));
						} else {
							return addOrder(connection, parameters.id, parameters.email)
								.then(results => {
									connection.end();
									res.send(createTextResponse(results.message));
								});
						}
					});
			});
	}
});

// Connect to MySQL
function connectToDatabase() {
	const connection = mysql.createConnection({
		host: '127.0.0.1',
		user: 'root',
		password: '',
		database: 'lottery',
	});

	return new Promise((resolve, reject) => {
		connection.connect();
		resolve(connection);
	});
}

// Get all lottery number
function getAllNumber(connection) {
	return new Promise((resolve, reject) => {
		connection.query('SELECT * FROM tbl_lottery WHERE lottery_status = 1', (error, results, fields) => {
			if (error) throw error;

			let message = '';

			if (results == undefined || results.length == 0) {
				message = 'ตอนนี้ล็อตเตอรี่หมดค่ะ (ร้องไห้)';
			} else {
				results.forEach((result, i) => {
					message += result.lottery_number;
					if (i < results.length - 1) message += ',\n';
				});
			}
			resolve(message);
		});
	});
}

// Get lottery by last number
function getLastNumber(connection, number, intent) {
	return new Promise((resolve, reject) => {
		connection.query(`SELECT * FROM tbl_lottery WHERE lottery_status = 1 AND lottery_number LIKE '%?'`, [number], (error, results, fields) => {
			if (error) throw error;

			let err = false;
			let message = null;
			let contexts = null;
			let randomNumber = Math.floor(Math.random() * results.length);
			let lotteryId = null;
			let lotteryNumber = null;

			if (intent == 'getLastNumber') {
				if (number.toString().length > 6) {
					message = 'ดูเหมือนคุณพิมพ์เลขมาเกินนะ';
				} else {
					if (results == undefined || results.length == 0) {
						message = `ล็อตเตอรี่เลขท้าย ${number} ไม่มีค่ะ (ร้องไห้)`;
					} else if (number.toString().length == 6) {
						message = `ล็อตเตอรี่เลข ${number} ตอนนี้มีค่ะ`;
					} else {
						results.forEach((result, i) => {
							message += result.lottery_number;
							if (i < results.length - 1) message += ',\n';
						});
					}
				}
				resolve(message);
			} else if (intent == 'buyLottery-Number') {
				if (number.toString().length > 6) {
					err = true;
					message = 'ดูเหมือนคุณพิมพ์เลขมาเกินนะ บอกเลขมาใหม่ค่ะ!';
					contexts = 'buyLottery-followup';
				} else if (results == undefined || results.length == 0) {
					err = true;
					message = 'ดูเหมือนเลขที่คุณพิมพ์มาจะไม่มีในคลังนะ บอกเลขมาใหม่ค่ะ!(ร้องไห้)';
					contexts = 'buyLottery-followup';
				} else {
					if (number.toString().length == 6) {
						message = `คุณต้องการเลข ${number} ใช่ไหมคะ?`;
						lotteryId = results[randomNumber].lottery_id;
						lotteryNumber = results[randomNumber].lottery_number;
						contexts = 'result-number';
					} else {
						message = `เนื่องจากเลขท้าย ${number} นั้นมีหลายใบ เราเลยสุ่มเลข ${results[randomNumber].lottery_number} มาให้ คุณต้องการเลขนี้หรือไม่คะ?`;
						lotteryId = results[randomNumber].lottery_id;
						lotteryNumber = results[randomNumber].lottery_number;
						contexts = 'result-number';
					}
				}
				resolve(createResultObject(err, message, lotteryId, lotteryNumber, contexts));
			}
		});
	});
}

// Update lottery status
function updateLotteryStatus(connection, id, number) {
	return new Promise((resolve, reject) => {
		connection.query(`UPDATE tbl_lottery SET lottery_status = 0 WHERE lottery_id = ?`, [id], (error, results, fields) => {
			if (error) throw error;
			
			let err = false;
			let message = null;
			let contexts = null;
			let lotteryId = null;
			let lotteryNumber = null;

			if (results.changedRows == 0) {
				err = true;
				message = `โอ๊ะ ดูเหมือนว่าเลข ${number} คุณจะโดนซื้อตัดหน้านะ บอกเลขมาใหม่หรือยกเลิกการสั่งซื้อได้ค่ะ!`;
				contexts = 'buyLottery-followup';
			} else {
				message = 'Update successfully.';
			}
			resolve(createResultObject(err, message, lotteryId, lotteryNumber, contexts));
		});
	});
}

// Add order
function addOrder(connection, id, email) {
	return new Promise((resolve, reject) => {
		connection.query(`INSERT INTO tbl_order (lottery_id, order_email) VALUES (?, ?)`, [id, email], (error, results, fields) => {
			if (error) throw error;
			
			let err = false;
			let message = null;
			let contexts = null;
			let lotteryId = null;
			let lotteryNumber = null;

			if (results.affectedRows == 0) {
				err = true;
				message = 'อุ๊ต๊ะ?! น่าจะมีบางอย่างผิดพลาดนะ! บอกเลขท้ายมาใหม่หรือยกเลิกได้ค่ะ!';
				contexts = 'buyLottery-followup';
			} else {
				message = 'เยี่ยม! เราได้บันทึกคำสั่งซื้อของคุณแล้วค่ะ กรุณาชำระเงินผ่านแอพธนาคาร X เลขที่บัญชี XXX-XXXXX-XX นาง X X แล้วส่งสลิปมายังอีเมล XX@XX.XX เพื่อยืนยันการชำระเงิน ขอบคุณค่ะ!'
			}
			resolve(createResultObject(err, message, lotteryId, lotteryNumber, contexts));
		});
	});
}

// Result object template
function createResultObject(error, message, id, number, contexts) {
	let results = {
		"error": error,
		"message": message,
		"data": {
			"lottery_id": id,
			"lottery_number": number
		},
		"contexts": contexts
	}
	return results;
}

// Text response template
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

// Output contexts
function createOutputContexts(results) {
	let response = {
		"fulfillmentMessages": [
			{
				"text": {
					"text": [
						results.message
					]
				}
			}
		],
		"outputContexts": [
			{
				"name": `projects/lotterysaler-cfbg/agent/sessions/871ec644-9798-6a72-ccaf-fa9be4d55aa8/contexts/${results.contexts}`,
				"lifespanCount": 5
			}
		]
	}

	if (results.error) {
		return response;
	} else {
		response.outputContexts[0].parameters = {
			"lottery_id": results.data.lottery_id,
			"lottery_number": results.data.lottery_number
		}
		return response;
	}
}

// Initialize
app.listen(3000, () => {
	console.log('Webhook is running on port 3000.');
});

// Exports
module.exports = app;