<?php
/**
 * 数据库连接与查询辅助
 */

declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    }
    return $pdo;
}

function prefix(): string
{
    return DB_PREFIX;
}

/**
 * 快捷查询单行
 */
function db_row(string $sql, array $params = []): ?array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * 快捷查询多行
 */
function db_rows(string $sql, array $params = []): array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * 快捷查询单值
 */
function db_val(string $sql, array $params = [])
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchColumn();
}

/**
 * 别名：db_value → db_val
 */
function db_value(string $sql, array $params = [])
{
    return db_val($sql, $params);
}

/**
 * 快捷执行（INSERT/UPDATE/DELETE），返回影响行数
 */
function db_exec(string $sql, array $params = []): int
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

/**
 * 别名：db_execute → db_exec
 */
function db_execute(string $sql, array $params = []): int
{
    return db_exec($sql, $params);
}

/**
 * 快捷插入，返回 lastInsertId
 */
function db_insert(string $sql, array $params = []): int
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return (int)db()->lastInsertId();
}