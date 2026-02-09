// Инициализация реплика сета для shard1
print("Инициализация shard1 реплика сета...");

const config = {
  _id: "shard1ReplSet",
  members: [
    { _id: 0, host: "shard1a:27018", priority: 3 },
    { _id: 1, host: "shard1b:27018", priority: 2 },
    { _id: 2, host: "shard1c:27018", priority: 1 }
  ]
};

try {
  const status = rs.status();
  print("Реплика сет shard1 уже инициализирован");
} catch (err) {
  print("Инициализация реплика сета shard1...");
  rs.initiate(config);
  
  // Ждем выборов
  sleep(5000);
  
  // Создаем пользователя для доступа (опционально)
  db.getSiblingDB("admin").createUser({
    user: "shard1admin",
    pwd: "shard1pass",
    roles: [{ role: "root", db: "admin" }]
  });
  
  print("Статус реплика сета shard1:");
  printjson(rs.status());
}

rs.initiate(
{_id: "shard1ReplSet",
  members: [
    { _id: 0, host: "shard1a:27018", priority: 3 },
    { _id: 1, host: "shard1b:27018", priority: 2 },
    { _id: 2, host: "shard1c:27018", priority: 1 }
]});