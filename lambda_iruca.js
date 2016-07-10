var AWS = require('aws-sdk');
var qs = require('querystring');
var token, kmsEncyptedToken;

var https = require('https');
var host = 'iruca.co';
var basePath = '/api/rooms/';
var statusMap = {
        'on': '在席', 
        'busy': '取込中',
        'off': '離席',
        'out': '外出',
        'vacation': '休暇'
    }

irucaRoomCode = "<irucaRoomCode>";
irucaPass = "<irucaPass>";
kmsEncyptedToken = "<kmsEncryptedToken>";

exports.handler = function (event, context) {
    if (token) {
        // Container reuse, simply process the event with the key in memory
        processEvent(event, context);
    } else if (kmsEncyptedToken && kmsEncyptedToken !== "CiDgQEJG51QuvdDHxPVc5h/m7r0C3q882SJNWEjly8u3+RKPAQEBAgB44EBCRudULr3Qx8T1XOYf5u69At6vPNkiTVhI5cvLt/kAAABmMGQGCSqGSIb3DQEHBqBXMFUCAQAwUAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAyhCJ0OacxdTP1Jwe4CARCAIziRhPyiutEOtRl/HBg2H10H1jO7UPyuTBd+DF0LO3fBMkV1") {
        var encryptedBuf = new Buffer(kmsEncyptedToken, 'base64');
        var cipherText = {CiphertextBlob: encryptedBuf};

        var kms = new AWS.KMS();
        kms.decrypt(cipherText, function (err, data) {
            if (err) {
                console.log("Decrypt error: " + err);
                context.fail(err);
            } else {
                token = data.Plaintext.toString('ascii');
                processEvent(event, context);
            }
        });
    } else {
        context.fail("Token has not been set.");
    }
};

var processEvent = function(event, context) {
    var body = event.body;
    var params = qs.parse(body);
    var requestToken = params.token;
    if (requestToken !== token) {
        console.error("Request token (" + requestToken + ") does not match exptected");
        context.fail("Invalid request token");
    }

    var user = params.user_name;
    var command = params.command;
    var channel = params.channel_name;
    var commandText = params.text;

    var commandTexts = commandText.replace( /@/g , '' ).split(' ');

    var membersUrl = 'https://' + host + basePath + irucaRoomCode + '/members' + '?pass=' + irucaPass;
    https.get(membersUrl, function(res) {
        var body = '';
        res.setEncoding('utf8');

        res.on('data', function(chunk) {
            body += chunk;
        });

        res.on('end', function() {
            data = JSON.parse(body);
            message = '';
            memberId = '';
            memberName = '';
            for(var i = 0; i < data.length; i++) {
                if (commandTexts[0] === 'all' || commandTexts[0] === data[i].name) {
                  message = message + " ```" + data[i].name + ' : ' + data[i].status + ' : ' + data[i].message  + "``` ";
                }
                if (statusMap[commandTexts[0]]) {
                    if (user === data[i].name) {
                        memberId = data[i].id;
                        memberName = data[i].name;
                    }
                }
            }

            if (statusMap[commandTexts[0]]) {
                putMember(context, statusMap[commandTexts[0]], memberId, memberName, commandTexts[1]);
            } else {
                context.succeed(message);
            }
        });

    }).on('error', function(e) {
        context.done('error', e);
    });
};

var putMember = function(context, status, memberId, memberName, message) {
    var body = JSON.stringify({
        pass: irucaPass,
        status: status,
        name: memberName,
        message: message !== null ? message : 'from slack'
    });
    var headers = {
        'Content-Type': 'application/json; charset=utf-8'
    };
    var options = {
        host: host,
        path: basePath + irucaRoomCode + '/members/' + memberId,
        method: 'PUT', 
        headers: headers
    };

    var req = https.request(options, function(res) {
        console.log('status: ' + res.statusCode);
        context.succeed(status + ': ' + message);
    });
    req.write(body);
    req.end();
};