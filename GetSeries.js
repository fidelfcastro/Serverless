'use strict'

var CryptoJS = require("crypto-js");
var async = require("async");
var AWS = require("aws-sdk");
var lambda = new AWS.Lambda({"region": "us-east-1"});
var http = require("http");
var s3 = new AWS.S3();

require("string_format");

var PUBLIC_KEY = "5ce9976ff5ac7877afe569406e97b2d4";
var PRIV_KEY = "455457e20ffa48ca6046483a599c1e12e9d83f43";
var ts = new Date().getTime();
var HASH = CryptoJS.MD5(ts + PRIV_KEY + PUBLIC_KEY).toString();

var getSeriesTemplateUrl = "http://gateway.marvel.com/v1/public/characters/{0}/series?limit=1&ts={1}&apikey={2}&hash={3}"


module.exports.get = (event, context, callback) => {
    var firstCharacterGetSeriesUrl = getSeriesTemplateUrl.format(event.firstCharacterId, ts, PUBLIC_KEY, HASH);
    var secondCharacterGetSeriesUrl = getSeriesTemplateUrl.format(event.secondCharacterId, ts, PUBLIC_KEY, HASH);
    console.log(firstCharacterGetSeriesUrl);
    console.log(secondCharacterGetSeriesUrl);

    var idArray = [event.firstCharacterId, event.secondCharacterId];
    idArray.sort();
    var charactersIds = idArray[0]+"_"+idArray[1];
    var key = charactersIds+"series";

    async.parallel([
        function(callback){
            async.waterfall([
                    async.apply(getCharacterDataSimple, firstCharacterGetSeriesUrl),
                    async.apply(invokeLambdas, event.firstCharacterId)

                ]
                ,callback)

        },
        function(callback){
            async.waterfall([
                    async.apply(getCharacterDataSimple, secondCharacterGetSeriesUrl),
                    async.apply(invokeLambdas, event.secondCharacterId)
                ]
                ,callback)

        }
    ], function(error,data){
        var response = filterSeries(data[0], data[1]);
        var jsonFile = JSON.stringify(response);


        var getParams = {
            Bucket: 'fidel-assignment7-bucket',
            Key: key
        };
        var putParams = {
            Bucket: 'fidel-assignment7-bucket',
            Key: key,
            ACL: "public-read",
            Body: jsonFile

        };
        s3.headObject(getParams, function (error, data) {
            if (error) {
                s3.putObject(putParams, function (err, data) {
                    if (err) {
                        console.log("Put params error " + err);
                    }
                    else {
                        console.log("API MARVEL");
                        callback(null,response);

                    }
                });
            }
            else if(data){
                s3.getObject(getParams,function (error,data) {
                    var fileData = data.Body.toString('utf-8');
                    var file = JSON.parse(fileData);
                    callback(null,file);
                    console.log("BUCKET");

                })
            }


        })
    });
};

var getCharacterDataSimple = function(getUrl, callback){
    var seriesTotal;

    http.get(getUrl, (res) => {
        res.setEncoding('utf8');
    var totalData = "";

    res.on("data", (data) => {
        totalData += data;
});

    res.on("end", (data) => {
        var series = JSON.parse(totalData);
    if (series["data"]) {
        seriesTotal = series["data"]["total"];

    };
    callback(null, seriesTotal);
    console.log(seriesTotal);

});
});
};

var invokeLambdas = function(characterId, seriesCount, callback){
    var lambdaCount = Math.ceil(seriesCount / 100);
    var tasks = [];
    var series =[];
    for(var i = 0; i < lambdaCount ; i++){
        var offset = i*100;
        tasks.push(function(callback){
            var lambdaParams = {
                FunctionName : 'fidel-serverless-dev-GetSeriesIndividual',
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
                var serie=JSON.parse(data[index].Payload)
                series = series.concat(serie);
            };
            callback(null,series);
    });
};

function filterSeries(firstSeries, secondSeries){
    var setA = new Set(firstSeries);
    var setB = new Set(secondSeries);
    var intersection = new Set([...setA].filter(x => setB.has(x)));
    return Array.from(intersection);
};