const notifyUserCreated = require('./notifyUserCreated');

async function loadEventScripts() {
  console.warn("\nLoading event's scripts..");
  notifyUserCreated();
  notifyUserUpdated();
  console.warn("Loading event's scripts DONE\n");
}

module.exports = {
  loadEventScripts: loadEventScripts,
};