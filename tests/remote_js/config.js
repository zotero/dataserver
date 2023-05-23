const fs = require('fs');

var config = {};

const data = fs.readFileSync('config.json');
config = JSON.parse(data);
config.timeout = 60000;
config.numOwnedGroups = 3;
config.numPublicGroups = 2;
module.exports = config;
