'use strict'

var CryptoJS = require("crypto-js");
var async = require("async");
var AWS = require("aws-sdk");
var lambda = new AWS.Lambda({"region": "us-east-1"});
var http = require("http");
require("string_format");

var PUBLIC_KEY = "5ce9976ff5ac7877afe569406e97b2d4";
var PRIV_KEY = "455457e20ffa48ca6046483a599c1e12e9d83f43";
var ts = new Date().getTime();
var HASH = CryptoJS.MD5(ts + PRIV_KEY + PUBLIC_KEY).toString();

var getUrl = "http://gateway.marvel.com/v1/public/characters/{0}/comics?limit=100&ts={1}&apikey={2}&hash={3}&offset={4}"

var comics = [];

module.exports.get = (event, context, callback) => {
    console.log(event);
    var url = getUrl.format(event.characterId, ts, PUBLIC_KEY, HASH, event.offset);

    getComics(url, callback);
};

var getComics = function(getUrl, callback){
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
        comicTotal = comics["data"]["results"].map(function(event){
            return event.title;

        });

    };

    callback(null, comicTotal);

});

});
};