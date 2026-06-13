-- Inicialización de PostgreSQL para VSPRO
-- Este script se ejecuta al crear el contenedor por primera vez

-- Habilitar extensión pgvector (necesaria para búsqueda semántica de productos)
CREATE EXTENSION IF NOT EXISTS vector;

-- Habilitar uuid-ossp para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Crear base de datos de test (para CI/CD local)
CREATE DATABASE vspro_test
  WITH OWNER = vspro
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.utf8'
  LC_CTYPE = 'en_US.utf8';

-- Habilitar extensiones en la BD de test también
\c vspro_test
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
