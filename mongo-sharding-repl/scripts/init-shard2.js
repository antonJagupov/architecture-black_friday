// Инициализация реплика сета для shard2
print("Инициализация shard2 реплика сета...");

const config = {
  _id: "shard2ReplSet",
  members: [
    { _id: 0, host: "shard2a:27019", priority: 3 },
    { _id: 1, host: "shard2b:27019", priority: 2 },
    { _id: 2, host: "shard2c:27019", priority: 1 }
  ]
};

try {
  const status = rs.status();
  print("Реплика сет shard2 уже инициализирован");
} catch (err) {
  print("Инициализация реплика сета shard2...");
  rs.initiate(config);
  
  // Ждем выборов
  sleep(5000);
  
  // Создаем пользователя для доступа (опционально)
  db.getSiblingDB("admin").createUser({
    user: "shard2admin",
    pwd: "shard2pass",
    roles: [{ role: "root", db: "admin" }]
  });
  
  print("Статус реплика сета shard2:");
  printjson(rs.status());
}


rs.initiate({
  _id: "shard2ReplSet",
  members: [
    { _id: 0, host: "shard2a:27019", priority: 3 },
    { _id: 1, host: "shard2b:27019", priority: 2 },
    { _id: 2, host: "shard2c:27019", priority: 1 }
  ]
});