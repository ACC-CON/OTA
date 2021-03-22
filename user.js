// user side 
// don't forget to install the following modules
const secp256k1 = require('secp256k1');
const createKeccakHash = require('keccak');
const LoginContract = require('./login_contract.js');
var net = require('net');
var keythereum = require("keythereum");
var Web3 = require('web3');
var web3 = new Web3();

var token;
var userIP = process.env.USER_IP;
var time = 20;
var iotIP = process.env.IOT_IP;
var iotPort = process.env.IOT_PORT;
var event_happened = false;

// get key pair
var privateKey;
var publicKey;

var datadir;
var password;
var keyObject;

if (process.env.DATADIR) {
    datadir = process.env.DATADIR;
    if (!process.env.KEY_STORE_FILE) {
        console.error("Key store file (KEY_STORE_FILE) not found!")
    }
    keyObject = keythereum.importFromFile(process.env.KEY_STORE_FILE, datadir);
    if (process.env.PASSWORD) {
        password = process.env.PASSWORD;
    } else {
        console.warn("Password (KEY_STORE_FILE) not found, set to an empty string.")
        password = ""
    }
    privateKey = keythereum.recover(password, keyObject);
} else {
    console.info("Datadir (DATADIR) not found.")
    if (!process.env.PRIVATE_KEY) {
        console.error("Private key (PRIVATE_KEY) not found!")
    }
    privateKey = process.env.PRIVATE_KEY
}
publicKey = secp256k1.publicKeyCreate(privateKey, false).slice(1)
createKeccakHash('keccak256').digest().toString('hex')
var rawAddress = createKeccakHash('keccak256').update(publicKey).digest('hex')
var address = rawAddress.substring(24, 64);
if (process.env.USER_ADDRESS) {
    if (address.toString().trim() === process.env.USER_ADDRESS) {
        console.log("\x1b[42m", "[+] Key pair and Ethereum Address verified")
        console.log("\x1b[0m", "\n");
    }
}

// wait for event
web3.setProvider(new web3.providers.HttpProvider('http://127.0.0.1:7545'));
if (!process.env.LOGIN_CONTRACT_ADDRESS) {
    console.error("Login contract address (LOGIN_CONTRACT_ADDRESS) not found!")
}
const loginContract = LoginContract.at(process.env.LOGIN_CONTRACT_ADDRESS);
const loginAttempt = loginContract.LoginAttempt();

loginAttempt.watch((error, event) => {
    if (error) {
        console.log(error);
        return;
    }
    console.log(event);
    event_happened = true;
    const sender = event.args.sender.toLowerCase();
    token = event.args.token;
    console.log("\x1b[42m", "[+] Authentication Event Arrived")
    console.log("\x1b[0m", "\n");
    console.log("Sender Address: " + sender);
    console.log("Authentication Token: " + token);

    if (event_happened == true) {
        message = token + "," + userIP + "," + time + "," + publicKey
        console.log("Authentication Package: " + message);
        web3.personal.unlockAccount(process.env.USER_ADDRESS, '<user password>', 20)

        var sign = web3.eth.sign(process.env.USER_ADDRESS, web3.sha3(message));
        console.log("Signature: " + sign);

        // connection to iot
        var client = new net.Socket();
        client.connect(iotPort, iotIP, function () {
            console.log('CONNECTED TO IOT Device: ' + iotIP + ':' + iotPort);
            // Write a message to the socket as soon as the client is connected, the server will receive it as message from the client 
            client.write(message);
            client.write(publicKey);
        });

        // Add a 'data' event handler for the client socket data is what the server sent to this socket
        client.on('data', function (data) {
            client.write(sign);
            console.log('Status: ' + data);
            // Close the client socket completely
            client.destroy();
        });

        // Add a 'close' event handler for the client socket
        client.on('close', function () {
            console.log('Connection closed');
        });
    }
});