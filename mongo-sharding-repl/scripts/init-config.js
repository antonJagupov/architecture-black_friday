# init-mongodb-cluster.ps1
# Полная инициализация MongoDB кластера с репликацией и шардированием
# Использование: .\init-mongodb-cluster.ps1

param(
    [switch]$CheckOnly = $false,
    [switch]$SkipApp = $false,
    [switch]$Help = $false
)

if ($Help) {
    Write-Host "Использование: .\init-mongodb-cluster.ps1" -ForegroundColor Cyan
    Write-Host "  -CheckOnly   Только проверка статуса, без инициализации"
    Write-Host "  -SkipApp      Пропустить запуск приложения"
    Write-Host "  -Help         Показать эту справку"
    Write-Host ""
    Write-Host "Примеры:"
    Write-Host "  .\init-mongodb-cluster.ps1           - Полная инициализация"
    Write-Host "  .\init-mongodb-cluster.ps1 -CheckOnly - Только проверка статуса"
    Write-Host "  .\init-mongodb-cluster.ps1 -SkipApp   - Без запуска приложения"
    exit 0
}

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " MongoDB Cluster Initialization Script" -ForegroundColor Cyan
Write-Host " For Windows PowerShell with Docker Desktop" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Цвета для вывода
$Host.UI.RawUI.ForegroundColor = "White"

# Функция для вывода сообщений
function Write-Log {
    param(
        [string]$Message,
        [string]$Type = "INFO"
    )
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    
    switch ($Type) {
        "INFO" {
            Write-Host "[$timestamp] [INFO] $Message" -ForegroundColor Green
        }
        "WARN" {
            Write-Host "[$timestamp] [WARN] $Message" -ForegroundColor Yellow
        }
        "ERROR" {
            Write-Host "[$timestamp] [ERROR] $Message" -ForegroundColor Red
        }
        "STEP" {
            Write-Host "[$timestamp] [STEP] $Message" -ForegroundColor Cyan
        }
        default {
            Write-Host "[$timestamp] [$Type] $Message"
        }
    }
}

# Функция ожидания доступности сервиса
function Wait-ForMongoService {
    param(
        [string]$ContainerName,
        [int]$Port,
        [string]$ServiceName,
        [int]$MaxRetries = 30
    )
    
    Write-Log "Ожидание доступности $ServiceName ($ContainerName:$Port)..." -Type "INFO"
    
    $retries = 0
    while ($retries -lt $MaxRetries) {
        try {
            $result = docker exec $ContainerName mongo --port $Port --eval "db.adminCommand('ping')" 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Log "$ServiceName доступен!" -Type "INFO"
                return $true
            }
        }
        catch {
            # Игнорируем ошибки, продолжаем попытки
        }
        
        $retries++
        Write-Host "  Попытка $retries/$MaxRetries..." -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
    
    Write-Log "$ServiceName не доступен после $MaxRetries попыток" -Type "ERROR"
    return $false
}

# Функция выполнения MongoDB команды
function Invoke-MongoCommand {
    param(
        [string]$ContainerName,
        [int]$Port,
        [string]$Command
    )
    
    try {
        $fullCommand = "docker exec $ContainerName mongo --port $Port --quiet --eval `$Command`"
        $result = Invoke-Expression $fullCommand
        return $result
    } catch {
        Write-Log "Ошибка выполнения команды в $ContainerName:$Port" -Type "ERROR"
        return $null
    }
}

# Функция инициализации реплика сета
function Initialize-ReplicaSet {
    param(
        [string]$PrimaryHost,
        [int]$PrimaryPort,
        [string]$ReplicaSetName,
        [string]$MembersJson
    )
    
    Write-Log "Инициализация реплика сета $ReplicaSetName на $PrimaryHost:$PrimaryPort..." -Type "STEP"
    
    # Проверяем, не инициализирован ли уже реплика сет
    $checkCommand = @"
try {
    rs.status().ok;
    print('already_initialized');
} catch(e) {
    if (e.codeName == 'NotYetInitialized') {
        print('not_initialized');
    } else {
        print('error');
    }
}
"@
    
    $status = Invoke-MongoCommand -ContainerName $PrimaryHost -Port $PrimaryPort -Command $checkCommand
    
    if ($status -and $status.Contains("already_initialized")) {
        Write-Log "Реплика сет $ReplicaSetName уже инициализирован" -Type "INFO"
        
        # Получаем статус для информации
        $statusCommand = "print('Статус реплика сета:'); rs.status();"
        Invoke-MongoCommand -ContainerName $PrimaryHost -Port $PrimaryPort -Command $statusCommand | Out-Host
        return $true
    }
    
    # Инициализируем реплика сет
    Write-Log "Выполняем rs.initiate() для $ReplicaSetName..." -Type "INFO"
    
    $initCommand = @"
print('=== Инициализация реплика сета $ReplicaSetName ===');
const config = $MembersJson;
print('Конфигурация:');
JSON.stringify(config, null, 2);
try {
    const result = rs.initiate(config);
    print('Результат инициализации:');
    JSON.stringify(result, null, 2);
} catch(err) {
    print('Ошибка при инициализации: ' + err.message);
    throw err;
}
"@
    
    Invoke-MongoCommand -ContainerName $PrimaryHost -Port $PrimaryPort -Command $initCommand | Out-Host
    
    # Ждем выборов
    Write-Log "Ожидание выборов primary для $ReplicaSetName (15 секунд)..." -Type "INFO"
    Start-Sleep -Seconds 15
    
    # Проверяем статус
    $statusCommand = @"
print('=== Статус реплика сета $ReplicaSetName ===');
try {
    const status = rs.status();
    print('Состояние узлов:');
    status.members.forEach((member, index) => {
        print('  ' + member.name + ': ' + member.stateStr);
    });
    
    const isMaster = db.isMaster();
    if (isMaster.ismaster) {
        print('✓ Этот узел является primary');
    } else if (isMaster.primary) {
        print('✓ Primary: ' + isMaster.primary);
    } else {
        print('✗ Primary еще не выбран');
    }
} catch(err) {
    print('Ошибка при проверке статуса: ' + err.message);
}
"@
    
    Invoke-MongoCommand -ContainerName $PrimaryHost -Port $PrimaryPort -Command $statusCommand | Out-Host
    
    Write-Log "Реплика сет $ReplicaSetName инициализирован" -Type "INFO"
    return $true
}

# Функция добавления шарда в кластер
function Add-ShardToCluster {
    param(
        [string]$MongosHost,
        [int]$MongosPort,
        [string]$ShardName,
        [string]$ShardMembers
    )
    
    Write-Log "Добавление шарда $ShardName в кластер через $MongosHost:$MongosPort..." -Type "STEP"
    
    $shardCommand = @"
print('=== Добавление шарда $ShardName ===');
try {
    // Проверяем, не добавлен ли уже этот шард
    const shards = sh.status().shards || [];
    const alreadyAdded = shards.some(shard => shard._id === '$ShardName');
    
    if (alreadyAdded) {
        print('Шард $ShardName уже добавлен');
        return {added: false, reason: 'already_exists'};
    }
    
    // Добавляем шард
    const result = sh.addShard('$ShardMembers');
    print('Результат добавления шарда:');
    JSON.stringify(result, null, 2);
    print('✓ Шард $ShardName успешно добавлен');
    return {added: true, result: result};
} catch(err) {
    print('Ошибка при добавлении шарда: ' + err.message);
    throw err;
}
"@
    
    $result = Invoke-MongoCommand -ContainerName $MongosHost -Port $MongosPort -Command $shardCommand
    if ($result) {
        Write-Host $result -ForegroundColor Green
        return $true
    }
    return $false
}

# Функция проверки статуса кластера
function Check-ClusterStatus {
    Write-Log "=== Проверка статуса кластера ===" -Type "STEP"
    
    # 1. Проверка контейнеров
    Write-Log "1. Проверка контейнеров:" -Type "INFO"
    docker-compose ps
    
    # 2. Проверка Config Server Replica Set
    Write-Log "`n2. Проверка Config Server Replica Set:" -Type "INFO"
    $configStatus = @"
try {
    const status = rs.status();
    const isMaster = db.isMaster();
    console.log('✓ Config Replica Set:');
    console.log('  Primary:', isMaster.primary || 'Не выбран');
    console.log('  Members:');
    status.members.forEach((m, i) => {
        console.log('   ', m.name + ':', m.stateStr);
    });
} catch(e) {
    console.log('✗ Config Replica Set не инициализирован:', e.message);
}
"@
    
    Invoke-MongoCommand -ContainerName "configSrv1" -Port 27017 -Command $configStatus
    
    # 3. Проверка Shard1 Replica Set
    Write-Log "`n3. Проверка Shard1 Replica Set:" -Type "INFO"
    $shard1Status = @"
try {
    const status = rs.status();
    const isMaster = db.isMaster();
    console.log('✓ Shard1 Replica Set:');
    console.log('  Primary:', isMaster.primary || 'Не выбран');
} catch(e) {
    console.log('✗ Shard1 Replica Set не инициализирован:', e.message);
}
"@
    
    Invoke-MongoCommand -ContainerName "shard1a" -Port 27018 -Command $shard1Status
    
    # 4. Проверка Shard2 Replica Set
    Write-Log "`n4. Проверка Shard2 Replica Set:" -Type "INFO"
    $shard2Status = @"
try {
    const status = rs.status();
    const isMaster = db.isMaster();
    console.log('✓ Shard2 Replica Set:');
    console.log('  Primary:', isMaster.primary || 'Не выбран');
} catch(e) {
    console.log('✗ Shard2 Replica Set не инициализирован:', e.message);
}
"@
    
    Invoke-MongoCommand -ContainerName "shard2a" -Port 27019 -Command $shard2Status
    
    # 5. Проверка кластера через Mongos
    Write-Log "`n5. Проверка кластера через Mongos:" -Type "INFO"
    $clusterStatus = @"
try {
    const status = sh.status();
    console.log('✓ MongoDB Cluster:');
    console.log('  Shards:', status.shards ? status.shards.length : 0);
    if (status.shards) {
        status.shards.forEach((shard, i) => {
            console.log('   ', shard._id);
        });
    }
} catch(e) {
    console.log('✗ Mongos не может подключиться к config серверам:', e.message);
}
"@
    
    Invoke-MongoCommand -ContainerName "mongos_router" -Port 27020 -Command $clusterStatus
    
    # 6. Проверка приложения
    Write-Log "`n6. Проверка приложения:" -Type "INFO"
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get -ErrorAction SilentlyContinue
        Write-Host "✓ Приложение доступно:" -ForegroundColor Green
        $response | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Приложение не доступно или еще не запущено" -ForegroundColor Yellow
    }
}

# ==========================
# ОСНОВНОЙ СКРИПТ
# ==========================

if ($CheckOnly) {
    Check-ClusterStatus
    exit 0
}

Write-Log "Шаг 1: Запуск всех контейнеров" -Type "STEP"
Write-Log "------------------------------" -Type "INFO"
Write-Log "Запускаем docker-compose..." -Type "INFO"

docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Log "Ошибка при запуске docker-compose!" -Type "ERROR"
    exit 1
}

Write-Host ""
Write-Log "Шаг 2: Инициализация Config Server Replica Set" -Type "STEP"
Write-Log "----------------------------------------------" -Type "INFO"

# Ожидаем запуска config серверов
if (-not (Wait-ForMongoService -ContainerName "configSrv1" -Port 27017 -ServiceName "Config Server 1")) {
    Write-Log "Config Server 1 не запустился" -Type "ERROR"
    exit 1
}

if (-not (Wait-ForMongoService -ContainerName "configSrv2" -Port 27017 -ServiceName "Config Server 2")) {
    Write-Log "Config Server 2 не запустился" -Type "ERROR"
    exit 1
}

if (-not (Wait-ForMongoService -ContainerName "configSrv3" -Port 27017 -ServiceName "Config Server 3")) {
    Write-Log "Config Server 3 не запустился" -Type "ERROR"
    exit 1
}

# Инициализируем config реплика сет
$configMembers = '{
    "_id": "configReplSet",
    "configsvr": true,
    "members": [
        { "_id": 0, "host": "configSrv1:27017", "priority": 2 },
        { "_id": 1, "host": "configSrv2:27017", "priority": 1 },
        { "_id": 2, "host": "configSrv3:27017", "priority": 1 }
    ]
}'

Initialize-ReplicaSet -PrimaryHost "configSrv1" -PrimaryPort 27017 -ReplicaSetName "configReplSet" -MembersJson $configMembers

Write-Host ""
Write-Log "Шаг 3: Инициализация Shard 1 Replica Set" -Type "STEP"
Write-Log "----------------------------------------" -Type "INFO"

# Ожидаем запуска shard1 реплик
if (-not (Wait-ForMongoService -ContainerName "shard1a" -Port 27018 -ServiceName "Shard 1a")) {
    Write-Log "Shard 1a не запустился" -Type "ERROR"
    exit 1
}

if (-not (Wait-ForMongoService -ContainerName "shard1b" -Port 27018 -ServiceName "Shard 1b")) {
    Write-Log "Shard 1b не запустился" -Type "ERROR"
    exit 1
}

if (-not (Wait-ForMongoService -ContainerName "shard1c" -Port 27018 -ServiceName "Shard 1c")) {
    Write-Log "Shard 1c не запустился" -Type "ERROR"
    exit 1
}

# Инициализируем shard1 реплика сет
$shard1Members = '{
    "_id": "shard1ReplSet",
    "members": [
        { "_id": 0, "host": "shard1a:27018", "priority": 3 },
        { "_id": 1, "host": "shard1b:27018", "priority": 2 },
        { "_id": 2, "host": "shard1c:27018", "priority": 1 }
    ]
}'

Initialize-ReplicaSet -PrimaryHost "shard1a" -PrimaryPort 27018 -ReplicaSetName "shard1ReplSet" -MembersJson $shard1Members

Write-Host ""
Write-Log "Шаг 4: Инициализация Shard 2 Replica Set" -Type "STEP"
Write-Log "----------------------------------------" -Type "INFO"

# Ожидаем запуска shard2 реплик
if (-not (Wait-ForMongoService -ContainerName "shard2a" -Port 27019 -ServiceName "Shard 2a")) {
    Write-Log "Shard 2a не запустился" -Type "ERROR"
    exit 1
}

if (-not (Wait-ForMongoService -ContainerName "shard2b" -Port 27019 -ServiceName "Shard 2b")) {
    Write-Log "Shard 2b не запустился" -Type "ERROR"
    exit 1
}

if (-not (Wait-ForMongoService -ContainerName "shard2c" -Port 27019 -ServiceName "Shard 2c")) {
    Write-Log "Shard 2c не запустился" -Type "ERROR"
    exit 1
}

# Инициализируем shard2 реплика сет
$shard2Members = '{
    "_id": "shard2ReplSet",
    "members": [
        { "_id": 0, "host": "shard2a:27019", "priority": 3 },
        { "_id": 1, "host": "shard2b:27019", "priority": 2 },
        { "_id": 2, "host": "shard2c:27019", "priority": 1 }
    ]
}'

Initialize-ReplicaSet -PrimaryHost "shard2a" -PrimaryPort 27019 -ReplicaSetName "shard2ReplSet" -MembersJson $shard2Members

Write-Host ""
Write-Log "Шаг 5: Запуск и настройка Mongos Router" -Type "STEP"
Write-Log "---------------------------------------" -Type "INFO"

Write-Log "Перезапускаем mongos router для подключения к инициализированным config серверам..." -Type "INFO"
docker-compose restart mongos_router

# Ждем запуска mongos
if (-not (Wait-ForMongoService -ContainerName "mongos_router" -Port 27020 -ServiceName "Mongos Router")) {
    Write-Log "Mongos Router не запустился" -Type "ERROR"
    exit 1
}

Write-Host ""
Write-Log "Шаг 6: Добавление шардов в кластер" -Type "STEP"
Write-Log "----------------------------------" -Type "INFO"

# Добавляем shard1 в кластер
Add-ShardToCluster -MongosHost "mongos_router" -MongosPort 27020 -ShardName "shard1ReplSet" -ShardMembers "shard1ReplSet/shard1a:27018,shard1b:27018,shard1c:27018"

# Добавляем shard2 в кластер
Add-ShardToCluster -MongosHost "mongos_router" -MongosPort 27020 -ShardName "shard2ReplSet" -ShardMembers "shard2ReplSet/shard2a:27019,shard2b:27019,shard2c:27019"

Write-Host ""
Write-Log "Шаг 7: Настройка шардирования базы данных" -Type "STEP"
Write-Log "----------------------------------------" -Type "INFO"

Write-Log "Включаем шардирование для базы данных 'somedb'..." -Type "INFO"

$enableShardingCommand = @"
print('=== Настройка шардирования ===');
try {
    sh.enableSharding('somedb');
	sh.shardCollection('somedb.helloDoc', { 'name' : 'hashed' } );
	use somedb;
    for(var i = 0; i < 1000; i++) db.helloDoc.insert({age:i, name:'ly'+i});
    print('✓ Шардирование включено для базы ''somedb''');
} catch(err) {
    print('Ошибка при включении шардирования: ' + err.message);
}
print('\n=== Статус кластера ===');
try {
    const status = sh.status();
    print('Кластер MongoDB готов!');
    print('Количество шардов: ' + (status.shards ? status.shards.length : 0));
    if (status.shards) {
        status.shards.forEach((shard, index) => {
            print('  Шард ' + (index + 1) + ': ' + shard._id);
        });
    }
} catch(err) {
    print('Ошибка при получении статуса: ' + err.message);
}
"@

Invoke-MongoCommand -ContainerName "mongos_router" -Port 27020 -Command $enableShardingCommand | Out-Host

if (-not $SkipApp) {
    Write-Host ""
    Write-Log "Шаг 8: Запуск приложения" -Type "STEP"
    Write-Log "------------------------" -Type "INFO"
    
    Write-Log "Запускаем FastAPI приложение..." -Type "INFO"
    docker-compose up -d pymongo_api
    
    # Ждем запуска приложения
    Write-Log "Ожидание запуска приложения (10 секунд)..." -Type "INFO"
    Start-Sleep -Seconds 10
    
    # Проверяем здоровье приложения
    Write-Log "Проверка здоровья приложения..." -Type "INFO"
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get -ErrorAction SilentlyContinue
        Write-Log "Приложение доступно по адресу: http://localhost:8080" -Type "INFO"
        $response | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Green
    }
    catch {
        Write-Log "Приложение еще не отвечает на health check" -Type "WARN"
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " ИНИЦИАЛИЗАЦИЯ ЗАВЕРШЕНА!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Доступные endpoint:" -ForegroundColor Yellow
Write-Host "  • MongoDB Router: mongodb://localhost:27020" -ForegroundColor White
Write-Host "  • FastAPI: http://localhost:8080" -ForegroundColor White
Write-Host "  • Health check: http://localhost:8080/health" -ForegroundColor White
Write-Host ""

Write-Host "Команды для проверки:" -ForegroundColor Yellow
Write-Host "  1. Проверить статус кластера:" -ForegroundColor White
Write-Host "     docker exec mongos_router mongo --port 27020 --eval `"sh.status()`"" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Проверить реплика сет config серверов:" -ForegroundColor White
Write-Host "     docker exec configSrv1 mongo --port 27017 --eval `"rs.status()`"" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Просмотр логов:" -ForegroundColor White
Write-Host "     docker-compose logs -f [имя_сервиса]" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. Остановка кластера:" -ForegroundColor White
Write-Host "     docker-compose down" -ForegroundColor Gray
Write-Host ""