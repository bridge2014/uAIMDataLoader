var express = require('express');
var router = express.Router();

var multer = require('multer');
var exec = require("child_process").exec;

var spawn = require("child_process").spawn;

var config = require("../config.js");

var superagent = require("superagent");

var upload = multer({dest: config.UPLOADS_DIR});

var async = require("async");

var kue = require("kue");

var fs = require("fs");

queue = kue.createQueue();


var winston = require('winston');

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
});


/* POST Annotation 
    Inputs:
        maskFile
        imageId
        userId

    Output {"Status": "Success"}

i*/

queue.process("order", function(job, done) {
    console.log("Executing "+job.data.case_id);

    var case_id = job.data.case_id;
    var execution_id = job.data.execution_id;
    var filePath=  job.data.maskFilePath;

    var OPENCV_DIR = config.OPENCV_DIR ;
    var MONGODB_LOADER_PATH = config.MONGODB_LOADER_PATH;
    var conversion_command = "java -Djava.library.path=" + OPENCV_DIR + " -jar " + MONGODB_LOADER_PATH + " --inptype maskfile --inpfile " + filePath + " --dest file --outfolder temp/ --eid " + execution_id + " --etype challenge --cid " + case_id ;
    winston.log("info", "Executing: " + conversion_command);
    try {
        exec(conversion_command, function(error, stdout, stderr){
            if(error) {
                winston.log("error", "Converter error");
                winston.log("error", error);       
                done("E"+error);
                return;
            }
            if(stderr) {
                winston.log("error", "Converter error");
                winston.log("error", stderr);       
                done("E2"+stderr);
                return;
            }
            winston.log("info", "Converter output");
            winston.log("info", stdout);
            console.log(filePath);
            var fileName = filePath.split("/");
            fileName = fileName[fileName.length -1];
            console.log(fileName);
            //POST the file to Bindaas
            var bindaas_host = config.bindaas_host;
            var bindaas_project = config.bindaas_project;
            var bindaas_provider = config.bindaas_provider;
            var bindaas_api_key = config.bindaas_api_key;                
            var file = "temp/"+fileName+".json";
            var lineReader = require("readline").createInterface({
                input: require('fs').createReadStream(file),
                terminal: false
            });
            var lines = 0;
            var payLoads = [];
            var postFunctions = [];
            fs.unlink(filePath, function(err){
                if(err) throw err;
                console.log("deleted original maskfile: "+filePath);
            
                     lineReader.on('line', function(line){
                    console.log("............");
                    payLoads.push(JSON.parse(line));
                    lines++;
                    console.log(lines);
            
                    
                }).on('close', function() {
                    fs.unlink(file, function(err){
                        if(err) throw err;
                        console.log("deleted "+file);
                        async.map(payLoads, function(payLoad, cb){
                            superagent.post(bindaas_host + bindaas_project + bindaas_provider +"/submit/jsonFile?api_key="+bindaas_api_key)
                            .send(payLoad)
                            .end(function(err, res){
                                if(err) {
                                    console.log(err);
                                    //done(err);
                                } else {
                                    console.log("........");
                                    console.log(payLoad.length);
                                }
                                cb(null, "...");
                            });                   
                        }, function(err, results){
                            console.log(err);
                            console.log("Finished executing order!");
                            done();
                        });               
                    });
                });
            });
        })
    } catch(e) {
        winston.log("error", "Converter error");
        winston.log("error", e);
        done(e);
        return;
    }
});

router.post('/postAnnotation', upload.single('mask'), function(req, res, next){

    var maskFile = req.file;
    var case_id = req.body.case_id;
    var execution_id = req.body.execution_id;

    if(maskFile && case_id && execution_id) {
        var filePath = maskFile.path;

        var job = queue.create("order", {
            maskFilePath: filePath,
            case_id: case_id,
            title: "Case_id: "+case_id + " Execution_id: "+execution_id,
            execution_id: execution_id
        }).save(function(err){
            if(!err){

                console.log(job)
                return res.json({
                    "Status": "Queued", "Job": job,
                    "id": job.id
                });
            } else {
                return res.status(500).json({"Status": "Failed"});
            }

        });

    } else {
        var error_str = "";
        if(!maskFile)
            error_str += " maskfile ";
        if(!imageId)
            error_str += " imageId ";
        if(!userId)
            error_str += " userId ";

        return res.status(400).send("Couldn't find :"+error_str);
    }

});



module.exports = router;
