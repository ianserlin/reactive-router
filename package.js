Package.describe({
  summary: "A Working Sub-Application Router"
});

Package.on_use(function (api) {
  api.use('underscore', 'client');
  api.add_files('router.js', ['client']);
});