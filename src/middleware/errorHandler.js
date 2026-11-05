// Global error handler
const errorHandler = (err, req, res, next) => {
  console.error('[AquaTrack Error]', err);

  // Postgres unique violation
  if (err.code === '23505') {
    const field = /Key \((.*?)\)/.exec(err.details || '')?.[1] || 'value';
    return res.status(400).json({
      success: false,
      message: `A record with this ${field} already exists`
    });
  }

  // Postgres foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'The referenced record does not exist or is still in use'
    });
  }

  // Postgres check constraint violation
  if (err.code === '23514') {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  // Postgres invalid input syntax (e.g. malformed UUID)
  if (err.code === '22P02') {
    return res.status(400).json({
      success: false,
      message: 'Invalid identifier format'
    });
  }

  // PostgREST: no rows returned by .single()
  if (err.code === 'PGRST116') {
    return res.status(404).json({
      success: false,
      message: 'Resource not found'
    });
  }

  // Postgres: table does not exist yet
  if (err.code === '42P01') {
    return res.status(500).json({
      success: false,
      message: 'Database schema not initialized. Run supabase/schema.sql in the Supabase SQL Editor.'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid session token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Session has expired'
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server Internal Error'
  });
};

module.exports = errorHandler;
