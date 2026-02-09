#!/bin/bash -x

###
# Инициализируем бд
###

docker exec mongos_router mongosh --port 27020 <<EOF
use somedb
for(var i = 1000; i < 2000; i++) db.helloDoc.insertOne({age:i, name:"ly"+i})
EOF

