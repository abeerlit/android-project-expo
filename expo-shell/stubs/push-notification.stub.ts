const PushNotification = {
  configure: () => {},
  localNotification: () => {},
  cancelAllLocalNotifications: () => {},
  removeAllDeliveredNotifications: () => {},
  getDeliveredNotifications: () => {},
  popInitialNotification: () => {},
  requestPermissions: () => Promise.resolve(false)
};

export default PushNotification;
