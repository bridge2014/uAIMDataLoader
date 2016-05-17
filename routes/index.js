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

var parseGeoJSONFileAndClean = function parseGeoJSONFileAndClean(maskFilePath, callback){
    var maskFilePath = maskFilePath;
    var maskFileName = maskFilePath.split("/");
    maskFileName = maskFileName[maskFileName.length - 1];
    var geoJSONFile = "temp/" + maskFileName + ".json";

    var lineReader = require("readline").createInterface({
        input: fs.createReadStream(geoJSONFile),
        terminal: false
    });
    var payLoads = [];
    try{
    fs.unlink(maskFilePath, function(err){  // Delete original mask file
        if(err) throw err;
        var lines=0;
        lineReader.on('line', function(line){   // Read GeoJSON File
            console.log("............");
            payLoads.push(JSON.parse(line));
            lines++;
            console.log(lines);           
        }).on('close', function() {
            fs.unlink(geoJSONFile, function(err){
                if(err) throw err;
                callback(err, payLoads);
            })
        });
    });
    } catch(err) {
        callback(err);
    }
}

var postMarkupToBindaas = function postMarkupToBindaas(payLoad, callback) {
    var bindaas_host = config.bindaas_host;
    var bindaas_project = config.bindaas_project;
    var bindaas_provider = config.bindaas_provider;
    var bindaas_api_key = config.bindaas_api_key;                
    

    var url = bindaas_host + bindaas_project + bindaas_provider + "/submit/json?api_key="+bindaas_api_key;
    superagent.post(url)
        .send(payLoad)
        .end(function(err, res){
            callback(err,res);
        });    

};

var fetchMetaData = function fetchMetaData(case_id, callback){
    var bindaas_host = config.bindaas_host;
    var bindaas_project = config.bindaas_metadata_project;
    var bindaas_provider = config.bindaas_metadata_provider;
    var bindaas_api_key = config.bindaas_api_key;

    var bindaas_metadata_endpoint = config.bindaas_metadata_endpoint;
    var url = bindaas_host + "/services"+ bindaas_project + bindaas_provider + "/query/getMetaDataForCaseID" + "?api_key="+bindaas_api_key + "&TCGAId="+case_id;
   console.log(url);
    superagent.get(url)
        .end(function(err, res){
            callback(err,res);
        });    
    
}

queue.process("MaskOrder", function(job, done) {
    console.log("Executing "+job.data.case_id);
    var case_id = job.data.case_id;
    var execution_id = job.data.execution_id;
    var filePath=  job.data.maskFilePath;
    var OPENCV_DIR = config.OPENCV_DIR ;
    var MONGODB_LOADER_PATH = config.MONGODB_LOADER_PATH;
    /*
    fetchMetaData(case_id, function(err, metadata){
	console.log(err)
	console.log(metadata);
        console.log(metadata.body);
        console.log(metadata);
        //var width = metadata[1].width;
        //var height = metadata[0].height;
    */
        var norm = job.data.width +","+job.data.height;
        var conversion_command = "java -Djava.library.path=" + OPENCV_DIR + " -jar " + MONGODB_LOADER_PATH + " --inptype maskfile --inpfile " + filePath + " --dest file --outfolder temp/ --eid " + execution_id + " --etype challenge --cid " + case_id + " --norm "+norm ;
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
                parseGeoJSONFileAndClean(filePath, function(err, payLoads){
                    async.map(payLoads, function(payLoad, cb){
                        postMarkupToBindaas(payLoad, function(err, post_response){
                            if(err.statusCode != 200){
				console.log(err);
                                done(err); //Send error to Kue
                                return; 
                            } else {
                                cb(null);
                            }
                        });
                    }
                    , function(err, results){
                        console.log("Finished");
                        done(err);
                    })
                    
                });
            });
            
        
        } catch(e) {
            winston.log("error", "Converter error");
            winston.log("error", e);
            done(e);
            return;
        }
        
    //});
});


router.post('/submitMarkupOrder', upload.single('markup'), function(req, res, next){
    postMarkupToBindaas();
});

router.post('/submitMaskOrder', upload.single('mask'), function(req, res, next){

    var maskFile = req.file;
    var case_id = req.body.case_id;
    var execution_id = req.body.execution_id;
    var width = req.body.width;
    var height = req.body.height;
    if(maskFile && case_id && execution_id && width && height) {
        var filePath = maskFile.path;
        var job = queue.create("MaskOrder", {
            maskFilePath: filePath,
            case_id: case_id,
            title: "Case_id: "+case_id + " Execution_id: "+execution_id,
            execution_id: execution_id,
            width: width, height: height
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
        if(!case_id)
            error_str += " imageId ";
        if(!execution_id)
            error_str += " userId ";
        return res.status(400).send("Couldn't find :"+error_str);
    }
});


module.exports = router;
