const fs = require('fs');

var config = {};

const data = fs.readFileSync('config.json');
config = JSON.parse(data);
config.timeout = 60000;

module.exports = config;
