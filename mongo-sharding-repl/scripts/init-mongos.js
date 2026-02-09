// Инициализация mongos router
print("Инициализация mongos router...");

// Ждем пока config серверы станут доступны
print("Ожидание config серверов...");
for (let i = 0; i < 30; i++) {
  try {
    const result = db.adminCommand({ ping: 1 });
    if (result.ok) {
      print("Mongos доступен");
      break;
    }
  } catch (err) {
    print(`Попытка ${i + 1}/30: Mongos еще не готов...`);
    sleep(2000);
  }
}

// Добавляем шарды
print("Добавление шардов...");

// Добавляем shard1
try {
  print("Добавление shard1...");
  sh.addShard("shard1ReplSet/shard1a:27018,shard1b:27018,shard1c:27018");
  print("Shard1 добавлен успешно");
} catch (err) {
  print("Ошибка при добавлении shard1: " + err);
}

// Добавляем shard2
try {
  print("Добавление shard2...");
  sh.addShard("shard2ReplSet/shard2a:27019,shard2b:27019,shard2c:27019");
  print("Shard2 добавлен успешно");
} catch (err) {
  print("Ошибка при добавлении shard2: " + err);
}

// Включаем шардирование для базы данных
print("Настройка шардирования...");
try {
  // Создаем базу данных
  db = db.getSiblingDB("somedb");
  
  // Включаем шардирование для базы
  sh.enableSharding("somedb");
  print("Шардирование включено для базы 'somedb'");
  
  // Пример: настройка шардирования для коллекции
  // sh.shardCollection("somedb.mycollection", { "_id": "hashed" });
  
} catch (err) {
  print("Ошибка при настройке шардирования: " + err);
}

print("Mongos инициализация завершена");
print("Список шардов:");
printjson(sh.status());