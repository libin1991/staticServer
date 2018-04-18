
let config = require('./config')
let path = require('path')
let fs = require('fs')
let mime = require('mime')
let chalk = require('chalk')
let util = require('util')
let url = require('url')
let http = require('http')
let stat = util.promisify(fs.stat)
let zlib = require('zlib');
//debug 可以后面放参数，可以根据后面的参数决定是否打印
let ejs = require('ejs')
let debug = require('debug')('static:app') 
//console.log(chalk.green('hello'));
//debug('app')
let tmpl = fs.readFileSync(path.join(__dirname,'tmpl.ejs'),'utf8')
let readDir = util.promisify(fs.readdir)
class Server {  //首先写一个Server类
    constructor(args){
        this.config =  {...config,...args};
        this.tmpl = tmpl
    }
    handleRequest(){
        return async(req,res)=>{
            //处理路径
            let {pathname} = url.parse(req.url,true)
            //因为拿到的pathname会是/index，这样会直接指向c盘，加./的话就变成当前
            let  p = path.join(this.config.dir,'.'+pathname)
         
            try{
               let statObj = await stat(p)//判断p路径对不对
                if(statObj.isDirectory()){
                    //如果是目录的话就应该把目录放出去
                    //用模板引擎写 handlebal ejs underscore jade 
                    let dirs = await readDir(p)
                    debug(dirs)//返回的是个数组[index.css,index.html]
                    dirs = dirs.map(dir => ({
                        path: path.join(pathname, dir),
                        name: dir
                    }))
                    console.log(dirs)
                let content = ejs.render(this.tmpl,{dirs})
                    res.setHeader('Content-Type','text/html;charset=utf8')
                    res.end(content)
                }else{
                   this.sendFile(req,res,p,statObj)
                }
            }catch(e){
                this.sendError(req,res,e)
            }
        }
    }
    cache(req,res,statObj){
        //etag if-none-match
        //Last-Modified  if-modified-since
        //Cache-Control 
        //ifNoneMatch一般是内容的md5戳 => ctime+size
        let ifNoneMatch = req.headers['if-none-match']
        //ifModifiedSince文件的最新修改时间
        let ifModifiedSince = req.headers['if-modified-since']
        let since = statObj.ctime.toUTCString();//最新修改时间
        //代表的是服务器文件的一个描述
        let etag = new Date(since).getTime()  +'-'+statObj.size
        res.setHeader('Cache-Control','max-age=10') 
        //10秒之内强制缓存
        res.setHeader('Etag',etag)
        res.setHeader('Last-Modified',since) //请求头带着
        //再访问的时候对比，如果相等，就走缓存
        if(ifNoneMatch !== etag){
            return false
        }
        if(ifModifiedSince != since){
            return false
        }
        res.statusCode = 304
        res.end()
        return true

    }
    compress(req, res, p, statObj) {
        let header = req.headers["accept-encoding"];
        if (header) {
            if (header.match(/\bgzip\b/)) {
                res.setHeader('Content-Encoding', 'gzip')
                return zlib.createGzip();
            } else if (header.match(/\bdeflate\b/)) {
                res.setHeader('Content-Encoding', 'deflate')
                return zlib.createDeflate();
            } else {
                return false;
            }
        } else {
            return false;
        }
    }
    range(req,res,statObj){
        //范围请求的头 ：Rang:bytes=1-100
        //服务器 Accept-Ranges:bytes
        //Content-Ranges:1-100/total
        let header = req.headers['range']
        console.log(header)
        //header =>bytes=1-100
        let start = 0;
        let end = statObj.size;//整个文件的大小
        if(header){
            res.setHeader('Content-Range','bytes')
            res.setHeader('Accept-Ranges',`bytes ${start}-${end}/${statObj.size}`)
            let [,s,e] = header.match(/bytes=(\d*)-(\d*)/);
            start = s?parseInt(s):start
            end = e? parseInt(e):end

        }
        console.log({start,end:end-1})
        return {start,end:end-1}//因为start是从0开始

    }
    sendFile(req,res,p,statObj){
        //缓存
        if(this.cache(req,res,statObj)) return
        //压缩
        let s = this.compress(req, res, p, statObj);
        res.setHeader('Content-Type',mime.getType(p)+';charset=utf8')
        //范围请求
        let {start,end} = this.range(req,res,statObj)
         let rs = fs.createReadStream(p,{start,end})
        if(s){
            //如果支持就是返回的流
            rs.pipe(s).pipe(res)
        }else{
            rs.pipe(res)
        }
        //是文件就直接读了
     
       
    }
    sendError(req,res,e){
        debug(util.inspect(e).toString())
        res.statusCode = 404;
        res.end()
    }
    start(){   //实例上的start方法
        let {port,hostname} = this.config
       let server =  http.createServer(this.handleRequest())//用http启动一个服务，回调里执行handleRequest方法
        let url = `http://${hostname}:${chalk.green(port)}`
         debug(url);
        server.listen(port, hostname);
    }
}
let server = new Server()
server.start()