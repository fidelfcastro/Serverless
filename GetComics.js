'use strict'

var CryptoJS = require("crypto-js");
var async = require("async");
var AWS = require("aws-sdk");
var lambda = new AWS.Lambda({"region": "us-east-1"});
var http = require("http");
var s3 = new AWS.S3();
var dynamodb = new AWS.DynamoDB({'region': 'us-east-1'});
var cloudwatchlogs = new AWS.CloudWatchLogs({'region': 'us-east-1'});


require("string_format");

var PUBLIC_KEY = "5ce9976ff5ac7877afe569406e97b2d4";
var PRIV_KEY = "455457e20ffa48ca6046483a599c1e12e9d83f43";
var ts = new Date().getTime();
var HASH = CryptoJS.MD5(ts + PRIV_KEY + PUBLIC_KEY).toString();

var getComicsTemplateUrl = "http://gateway.marvel.com/v1/public/characters/{0}/comics?limit=1&ts={1}&apikey={2}&hash={3}"
var startTime, endTime, character1, character2, key, memorySize, memoryUsed, requestId, logName, singleQuantity = "";
var singleQty = 0;


module.exports.get = (event, context, callback) =>
{
    startTime = new Date().toUTCString();
    character1 = event.firstCharacterId.toString();
    character2 = event.secondCharacterId.toString();
    console.log("START TIME: " + startTime);


    var idArray = [event.firstCharacterId, event.secondCharacterId];
    idArray.sort();
    var charactersIds = idArray[0] + "_" + idArray[1];
    key = charactersIds + "comics";

    var getParams = {
        Bucket: 'fidel-assignment7-bucket',
        Key: key
    };

    var dynamoParams = {
        TableName: 'Fidel-MarvelTableA8'
    }

    s3.headObject(getParams, function (error, data) {
        if (error) {
            var firstCharacterGetComicUrl = getComicsTemplateUrl.format(event.firstCharacterId, ts, PUBLIC_KEY, HASH);
            var secondCharacterGetComicUrl = getComicsTemplateUrl.format(event.secondCharacterId, ts, PUBLIC_KEY, HASH);

            async.parallel([
                function (callback) {
                    async.waterfall([
                            async.apply(getCharacterDataSimple, firstCharacterGetComicUrl),
                            async.apply(invokeLambdas, event.firstCharacterId)

                        ]
                        , callback)
                },
                function (callback) {
                    async.waterfall([
                            async.apply(getCharacterDataSimple, secondCharacterGetComicUrl),
                            async.apply(invokeLambdas, event.secondCharacterId)
                        ]
                        , callback)
                }
            ], function (error, data) {
                var response = filterComics(data[0], data[1]);
                var jsonFile = JSON.stringify(response);

                callback(null, response);

                var putParams = {
                    Bucket: 'fidel-assignment7-bucket',
                    Key: key,
                    ACL: "public-read",
                    Body: jsonFile

                };

                s3.putObject(putParams, function (err, data) {
                    if (err) {
                        console.log("Put params error " + err);
                    }
                    else {
                        console.log("API MARVEL");

                    }
                });

            });
        }

        else{

            s3.getObject(getParams, function (error, data) {

                var fileData = data.Body.toString('utf-8');
                var file = JSON.parse(fileData);
                console.log("BUCKET");
                callback(null, file);

            })

        }

    })
    requestId = context.awsRequestId;
    log(requestId);
}

var log = function logEvents(id){
    endTime = new Date().toUTCString();
    singleQuantity = singleQty.toString();
    var requestId = id;
    var logParams = {
        logGroupName:"/aws/lambda/fidel-serverless-dev-GetComics",
        filterPattern: 'REPORT',
        interleaved: true
    }

    cloudwatchlogs.filterLogEvents(logParams,function(error, data) {
        if(error){
            console.log('Console Watch Error: ' + error);
        }
        else{
            var logList=[]
            var log=data.events
            log.forEach(function(object){
                var req = object.message.match(/RequestId: (.*)\tDuration/)[1];
                //if(req.isEqual(requestId)){
                    logList.push(object.message.match(/Memory Size: (.*)\tMax/)[1]);
                    logList.push(object.message.match(/Memory Used: (.*)\t/)[1]);
                //}

            })
            memorySize = logList[0];
            memoryUsed = logList[1];

        }
            dynamodb.putItem({
                "TableName": "Fidel-MarvelTableA8",
                "Item": {
                    "id": {"S": requestId},
                    "StartTime": {"S": startTime},
                    "EndTime": {"S": endTime},
                    "SingleQuantity": {"S": singleQuantity},
                    "Character1": {"S": character1},
                    "Character2": {"S": character2},
                    "MemoryReserved": {"S": memorySize},
                    "MemoryUsed": {"S": memoryUsed}
                }
            }, function (err, data) {
                if (err) {
                    console.log('Error putting item into dynamodb failed: ' + err);
                }
                else {
                    console.log('DYNAMO SUCCESS');
                }
            });

    })
}

var getCharacterDataSimple = function(getUrl, callback){
    var comicTotal;

    http.get(getUrl, (res) => {
        res.setEncoding('utf8');
    var totalData = "";


    res.on("data", (data) => {
        totalData += data;
});

    res.on("end", (data) => {
        var comics = JSON.parse(totalData);
    if (comics["data"]) {
        comicTotal = comics["data"]["total"];
    };
    callback(null, comicTotal);

    });
});
};

var invokeLambdas = function(characterId, comicCount, callback){
    var lambdaCount = Math.ceil(comicCount / 100);
    singleQty = lambdaCount+singleQty;

    var tasks = [];
    var comics =[]
    for(var i = 0; i < lambdaCount ; i++){
        var offset = i*100;
        tasks.push(function(callback){
            var lambdaParams = {
                FunctionName : 'fidel-serverless-dev-GetComicsIndividual',
                InvocationType : 'RequestResponse',
                Payload: '{"characterId" : "' + characterId + '", "offset" :"'+ offset + '"}'
            };
            lambda.invoke(lambdaParams, function(error,data){
                if(error){
                    callback(error);
                }
                else{
                    callback(null,data);

                }
            });

        });
    };

    async.parallel(tasks, function(error,data){
            for(var index = 0; index < data.length ; index++){
                var comic=JSON.parse(data[index].Payload)
                comics = comics.concat(comic);
            };
            callback(null,comics);
    });
};

function filterComics(firstComics, secondComics){
    var setA = new Set(firstComics);
    var setB = new Set(secondComics);
    var intersection = new Set([...setA].filter(x => setB.has(x)));
    return Array.from(intersection);
};


