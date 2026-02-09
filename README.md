0. Перейти в каталог проекта /sharding-repl-cache

1. docker-compose build --no-cache

2. powershell -ExecutionPolicy Bypass -File ./scripts/init.ps1



3. Если пункт 7 не прошел, выполнить вручную: 

docker exec -it mongos_router mongosh --port 27020

sh.addShard("shard1ReplSet/shard1a:27018,shard1b:27018,shard1c:27018");
sh.addShard("shard2ReplSet/shard2a:27019,shard2b:27019,shard2c:27019");

sh.enableSharding("somedb");
sh.shardCollection("somedb.helloDoc", { "name" : "hashed" } )

use somedb;

for(var i = 0; i < 1000; i++) db.helloDoc.insert({age:i, name:"ly"+i})

db.helloDoc.countDocuments() 
exit();

4. можно проверять http://localhost:8080/docs