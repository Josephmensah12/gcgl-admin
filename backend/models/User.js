const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING(50), unique: true, allowNull: false },
    email: { type: DataTypes.STRING(100), unique: true, allowNull: false },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    full_name: { type: DataTypes.STRING(100), allowNull: false },
    role: {
      type: DataTypes.STRING(20),
      defaultValue: 'Staff',
      validate: { isIn: [['Admin', 'Manager', 'Staff', 'Driver']] },
    },
    phone: DataTypes.STRING(20),
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    last_login: DataTypes.DATE,
    failed_login_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    locked_until: DataTypes.DATE,
  }, {
    tableName: 'admin_users',
    underscored: true,
    timestamps: true,
  });

  User.prototype.checkPassword = async function (password) {
    return bcrypt.compare(password, this.password_hash);
  };

  User.beforeCreate(async (user) => {
    user.password_hash = await bcrypt.hash(user.password_hash, 12);
  });

  return User;
};
