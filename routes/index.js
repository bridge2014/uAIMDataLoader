var express = require('express');
var router = express.Router();

var multer = require('multer');
var exec = require("child_process").exec;

var spawn = require("child_process").spawn;

var config = require("../config.js");

var upload = multer({dest: config.UPLOADS_DIR});


var kue = require('kue');

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

            if(error){
                winston.log("error", "Converter error");
                winston.log("error", error);       
                done("E"+error);
                return;
                //return res.status(500).send("Error executing converter" + error);
            }
            if(stderr) {
                winston.log("error", "Converter error");
                winston.log("error", stderr);       
                done("E2"+stderr);
                return;
                //return res.status(500).send("Error executing converter" +stderr);
            }

            winston.log("info", "Converter output");
            winston.log("info", stdout);

            //POST the file to Bindaas
            
        
            console.log("........");
            //Delete the file
            done();
            
           
        });
    }
    catch(e) {

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
            execution_id: execution_id
        }).save();
        console.log(job)
        return res.send("Created order");

        /*      
        var conversion_command = "java -Djava.library.path=" + OPENCV_DIR + " -jar " + MONGODB_LOADER_PATH + " --inptype maskfile --inpfile " + filePath + " --dest file --outfolder temp/ --eid " + userId + " --etype challenge --cid " + imageId ;

        winston.log("info", "Executing: " + conversion_command);
        
        try { 
            exec(conversion_command, function(error, stdout, stderr){

                if(error){
                    winston.log("error", "Converter error");
                    winston.log("error", error);       
                    return res.status(500).send("Error executing converter" + error);
                }
                if(stderr) {
                    winston.log("error", "Converter error");
                    winston.log("error", error);       
                    return res.status(500).send("Error executing converter" +stderr);
                }

                winston.log("info", "Converter output");
                winston.log("info", stdout);

                //POST the file to Bindaas
                
            

                //Delete the file

                
                res.json({"Status": "Success"});
            });
        }
        catch(e) {

            winston.log("error", "Converter error");
            winston.log("error", e);
            res.status(500).send("Error executing converter "+e);
        }
        */


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
