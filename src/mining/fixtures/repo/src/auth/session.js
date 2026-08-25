export function requireOwner(req, res, next) {
  if (!req.session.userId) return res.status(401).end();
  next();
}
