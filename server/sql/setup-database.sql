-- ============================================================
--  photo-stars 数据库初始化脚本（只需用 root 执行一次）
--  用法：进入 mysql 后执行
--        source D:/photo-stars/server/sql/setup-database.sql;
--  效果：创建专属库 photo_stars + 专用账号 photo_stars（非 root）
-- ============================================================

-- 1. 创建项目专属数据库
CREATE DATABASE IF NOT EXISTS photo_stars
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 2. 创建专用账号（不是 root）
CREATE USER IF NOT EXISTS 'photo_stars'@'localhost' IDENTIFIED BY 'PhotoStars_2026';

-- 3. 只授权给 photo_stars 这一个库
GRANT ALL PRIVILEGES ON photo_stars.* TO 'photo_stars'@'localhost';

-- 4. 刷新权限生效
FLUSH PRIVILEGES;

-- 5. 验证（应看到 photo_stars 库和账号）
SHOW DATABASES LIKE 'photo_stars';
SELECT user, host FROM mysql.user WHERE user = 'photo_stars';
