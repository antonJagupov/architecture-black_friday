Write-Host "=== Инициализация MongoDB кластера ==="

# 1. Запускаем config серверы первыми
Write-Host "1. Запускаем config серверы..."
docker-compose up -d configSrv1 configSrv2 configSrv3
Start-Sleep -Seconds 30

# 2. Инициализируем config replica set
Write-Host "2. Инициализируем configReplSet..."
docker exec configSrv1 mongosh --port 27017 --eval "
rs.initiate(
  {
    _id: 'configReplSet',
    configsvr: true,
    members: [
      { _id : 0, host : 'configSrv1:27017', priority: 3 },
      { _id : 1, host : 'configSrv2:27017', priority: 2 },
      { _id : 2, host : 'configSrv3:27017', priority: 1 }
    ]
  }
)"
Write-Host "Ждем инициализации config серверов (30 секунд)..."
Start-Sleep -Seconds 45

# 3. Запускаем шарды
Write-Host "3. Запускаем все шарды..."
docker-compose up -d shard1a shard1b shard1c shard2a shard2b shard2c
Start-Sleep -Seconds 30

# 4. Инициализируем шард 1
Write-Host "4. Инициализируем shard1ReplSet..."
docker exec shard1a mongosh --port 27018 --eval "
rs.initiate(
  {
    _id: 'shard1ReplSet',
    members: [
      { _id : 0, host : 'shard1a:27018', priority: 3 },
      { _id : 1, host : 'shard1b:27018', priority: 2 },
      { _id : 2, host : 'shard1c:27018', priority: 1 }
    ]
  }
)"
Start-Sleep -Seconds 30

# 5. Инициализируем шард 2
Write-Host "5. Инициализируем shard2ReplSet..."
docker exec shard2a mongosh --port 27019 --eval "
rs.initiate(
  {
    _id: 'shard2ReplSet',
    members: [
      { _id : 0, host : 'shard2a:27019', priority: 3 },
      { _id : 1, host : 'shard2b:27019', priority: 2 },
      { _id : 2, host : 'shard2c:27019', priority: 1 }
    ]
  }
)"
Write-Host "Ждем инициализации шардов (20 секунд)..."
Start-Sleep -Seconds 30

# 6. Запускаем mongos
Write-Host "6. Запускаем mongos router..."
docker-compose up -d mongos_router
Write-Host "Ждем инициализации mongos (30 секунд)..."
Start-Sleep -Seconds 30

# 7. Добавляем шарды в кластер
Write-Host "7. Добавляем шарды в кластер через mongos..."
docker exec mongos_router mongosh --port 27020 --eval "
sh.addShard('shard1ReplSet/shard1a:27018,shard1b:27018,shard1c:27018');
sh.addShard('shard2ReplSet/shard2a:27019,shard2b:27019,shard2c:27019');
print('Шарды добавлены:');
sh.status();"
Start-Sleep -Seconds 30

# 8. Шардируем системные коллекции
Write-Host "8. Шардируем системные коллекции..."
docker exec mongos_router mongosh --port 27020 --eval "
sh.enableSharding('config');
db = db.getSiblingDB('config');
if (!db.getCollectionNames().includes('system.sessions')) {
    db.createCollection('system.sessions');
}
try {
    sh.shardCollection('config.system.sessions', { _id: 'hashed' });
    print('✓ system.sessions успешно шардирована');
} catch(e) {
    if (e.codeName == 'AlreadyInitialized') {
        print('✓ system.sessions уже шардирована');
    } else {
        print('⚠ Ошибка при шардировании system.sessions: ' + e.errmsg);
    }
}
db.adminCommand({ flushRouterConfig: 1 });"
Start-Sleep -Seconds 20

# 9. Создаем пользовательскую базу и включаем шардирование
Write-Host "9. Создаем тестовую базу данных..."
docker exec mongos_router mongosh --port 27020 --eval "
sh.enableSharding('somedb');
sh.shardCollection('somedb.helloDoc', { 'name' : 'hashed' } );
db = db.getSiblingDB('somedb');
for(var i = 0; i < 1000; i++) db.helloDoc.insert({age:i, name:'ly'+i})
db.helloDoc.countDocuments(); 
print('Тестовых документов: ' + db.helloDoc.countDocuments());"
Start-Sleep -Seconds 20 

# 10. Запускаем Redis
Write-Host "10. Запускаем Redis..."
docker-compose up -d redis-master redis-slave-1 redis-slave-2
Start-Sleep -Seconds 30

# 11. Запускаем pymongo_api
Write-Host "10. Запускаем pymongo_api..."
docker-compose up -d pymongo_api
