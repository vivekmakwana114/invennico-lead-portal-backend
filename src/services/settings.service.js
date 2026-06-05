const { Settings } = require('../models');

const getSettings = async () => {
  const settings = await Settings.findById('global');
  if (settings) return settings;
  return Settings.create({ _id: 'global' });
};

const updateSettings = async (updateBody) => {
  return Settings.findOneAndUpdate(
    { _id: 'global' },
    { $set: updateBody },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  );
};

module.exports = { getSettings, updateSettings };
