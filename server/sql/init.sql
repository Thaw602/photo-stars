-- ============================================================
--  photo-stars 表结构初始化脚本（幂等，可重复执行）
--  用法：mysql -u photo_stars -pPhotoStars_2026 photo_stars < server/sql/init.sql
--  范围：仅 CREATE TABLE IF NOT EXISTS + 索引，不含 CREATE DATABASE / CREATE USER
--  （建库、建账号见 setup-database.sql，需 root 执行一次）
-- ============================================================

SET NAMES utf8mb4;

-- 1. users 用户表（auth_provider + provider_id 唯一标识一个用户）
CREATE TABLE IF NOT EXISTS users (
  id            INT           NOT NULL AUTO_INCREMENT,
  auth_provider ENUM('demo','qq') NOT NULL,
  provider_id   VARCHAR(255)  NOT NULL,
  nickname      VARCHAR(255)  NOT NULL,
  avatar_url    VARCHAR(500)  NULL,
  created_at    DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_provider_id (provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. photos 照片表
CREATE TABLE IF NOT EXISTS photos (
  id             INT           NOT NULL AUTO_INCREMENT,
  user_id        INT           NULL,
  media_type     ENUM('photo','video') NOT NULL,
  file_path      VARCHAR(255)  NOT NULL,
  thumbnail_path VARCHAR(255)  NULL,
  file_size      BIGINT        NOT NULL,
  taken_date     DATE          NOT NULL,
  sort_order     INT           NOT NULL DEFAULT 0,
  is_builtin     TINYINT(1)    NOT NULL DEFAULT 0,
  deleted_at     DATETIME      NULL,
  created_at     DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_photos_user_id (user_id),
  KEY idx_photos_media_type (media_type),
  KEY idx_photos_taken_date (taken_date),
  KEY idx_photos_builtin_active (is_builtin, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. captions 照片文案表（一张照片最多一条文案）
CREATE TABLE IF NOT EXISTS captions (
  id         INT      NOT NULL AUTO_INCREMENT,
  photo_id   INT      NOT NULL,
  text       TEXT     NOT NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_captions_photo_id (photo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. shares 分享表（一张照片可有多个分享，token 唯一）
CREATE TABLE IF NOT EXISTS shares (
  id         INT          NOT NULL AUTO_INCREMENT,
  photo_id   INT          NOT NULL,
  token      VARCHAR(255) NOT NULL,
  expires_at DATETIME     NOT NULL,
  deleted_at DATETIME     NULL,
  created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_shares_token (token),
  KEY idx_shares_photo_id (photo_id),
  KEY idx_shares_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
