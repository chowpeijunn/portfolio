// In the Vercel deployment, data state is held in the browser until
// "Save & Publish" commits it to GitHub. This endpoint is a no-op kept
// for backward compatibility.
module.exports = (req, res) => res.json({ ok: true });
