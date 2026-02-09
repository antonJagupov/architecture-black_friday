0. Перейти в каталог проекта

1. docker-compose build --no-cache

2. docker-compose up -d --build


3. Подключитесь к серверу конфигурации и сделайте инициализацию: 

docker exec -it configSrv mongosh --port 27017

> rs.initiate(
  {
    _id : "config_server",
       configsvr: true,
    members: [
      { _id : 0, host : "configSrv:27017" }
    ]
  }
);
> exit();


4. Инициализируйте шарды:

docker exec -it shard1 mongosh --port 27018

> rs.initiate(
    {
      _id : "shard1",
      members: [
        { _id : 0, host : "shard1:27018" },
       // { _id : 1, host : "shard2:27019" }
      ]
    }
);
> exit();

docker exec -it shard2 mongosh --port 27019

> rs.initiate(
    {
      _id : "shard2",
      members: [
       // { _id : 0, host : "shard1:27018" },
        { _id : 1, host : "shard2:27019" }
      ]
    }
  );
> exit();

5. Инцициализируйте роутер и наполните его тестовыми данными:

docker exec -it mongos_router mongosh --port 27020

> sh.addShard( "shard1/shard1:27018");
> sh.addShard( "shard2/shard2:27019");

> sh.enableSharding("somedb");
> sh.shardCollection("somedb.helloDoc", { "name" : "hashed" } )

> use somedb

> for(var i = 0; i < 1000; i++) db.helloDoc.insert({age:i, name:"ly"+i})

> db.helloDoc.countDocuments() 
> exit();

6. Сделайте проверку на шардах:

echo "use somedb
db.helloDoc.countDocuments()" | docker compose exec -T shard1 mongosh --port 27018 --quiet

7. Сделайте проверку на втором шарде:

echo "use somedb
db.helloDoc.countDocuments()" | docker compose exec -T shard2 mongosh --port 27019 --quiet

