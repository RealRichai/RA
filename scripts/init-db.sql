-- RealRiches Database Initialization
-- This script runs when the PostgreSQL container first starts

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Note: uuid-ossp is not needed - PostgreSQL 13+ has built-in gen_random_uuid()
