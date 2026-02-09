0. Перейти в каталог проекта

1. docker-compose build --no-cache

2. docker-compose up -d --build


3. Подключитесь к серверу конфигурации и сделайте инициализацию: 

docker exec -it configSrv1 mongosh --port 27017

rs.initiate(
  {
  _id: "configReplSet",
  configsvr: true,
  members: [
		{ _id: 0, host: "configSrv1:27017", priority: 3 },
		{ _id: 1, host: "configSrv2:27017", priority: 2 },
		{ _id: 2, host: "configSrv3:27017", priority: 1 }
	  ]
  }
);
exit();


4. Инициализируйте шарды:

docker exec -it shard1a mongosh --port 27018

rs.initiate(
{_id: "shard1ReplSet",
  members: [
    { _id: 0, host: "shard1a:27018", priority: 3 },
    { _id: 1, host: "shard1b:27018", priority: 2 },
    { _id: 2, host: "shard1c:27018", priority: 1 }
]});
exit();

docker exec -it shard2a mongosh --port 27019

rs.initiate({
  _id: "shard2ReplSet",
  members: [
    { _id: 0, host: "shard2a:27019", priority: 3 },
    { _id: 1, host: "shard2b:27019", priority: 2 },
    { _id: 2, host: "shard2c:27019", priority: 1 }
  ]
});
exit();

убедится что в обоих шардах появился PRIMARY:

rs.status(); # повторяь раз в 30 секунд пока в ответе не будет stateStr: 'PRIMARY',

5. Инцициализируйте роутер и наполните его тестовыми данными:

docker exec -it mongos_router mongosh --port 27020

sh.addShard("shard1ReplSet/shard1a:27018,shard1b:27018,shard1c:27018");
sh.addShard("shard2ReplSet/shard2a:27019,shard2b:27019,shard2c:27019");

sh.enableSharding("somedb");
sh.shardCollection("somedb.helloDoc", { "name" : "hashed" } )

use somedb

for(var i = 0; i < 1000; i++) db.helloDoc.insert({age:i, name:"ly"+i})

db.helloDoc.countDocuments() 
exit();

6. Сделайте проверку на шардах:

echo "use somedb
db.helloDoc.countDocuments()" | docker compose exec -T shard1a mongosh --port 27018 --quiet

7. Сделайте проверку на втором шарде:

echo "use somedb
db.helloDoc.countDocuments()" | docker compose exec -T shard2a mongosh --port 27019 --quiet

