// Wraps an async route handler so a rejected promise (e.g. a DB constraint
// error) is forwarded to Express's error middleware instead of becoming an
// unhandled rejection that crashes the whole server.
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
