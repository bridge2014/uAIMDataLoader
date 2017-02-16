# uAIMDataLoader
API for loading Markups for caMicroscope.


### /submitZipOrder
Example with curl: 

`curl -X POST -F case_id=xyz -F zip=@test_output.zip localhost:3001/submitZipOrder`

### /submitMaskOrder
Parameters
* file
* case_id
* execution_id
* width
* height
* x
* y
