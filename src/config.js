let path = require('path')
//启动服务的配置项
let config = {
    hostname:'localhost',
    port:3000,
    dir:path.join(__dirname,'..','public')
}
module.exports = config