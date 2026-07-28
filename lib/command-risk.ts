const HIGH_RISK_COMMAND = [
  /\b(?:rm|rmdir|shred|truncate)\b/i,
  /\b(?:kill|pkill|killall|reboot|shutdown|poweroff|halt)\b/i,
  /\b(?:chmod|chown|chgrp|useradd|userdel|usermod|groupadd|groupdel|passwd)\b/i,
  /\b(?:mount|umount|iptables|nft|ufw|firewall-cmd)\b/i,
  /\b(?:apt|apt-get|yum|dnf|apk|pacman)\s+(?:install|remove|purge|upgrade|update)\b/i,
  /\bsystemctl\s+(?:start|stop|restart|reload|enable|disable|mask|unmask)\b/i,
  /\bservice\s+\S+\s+(?:start|stop|restart|reload)\b/i,
  /\bdocker\s+(?:rm|rmi|stop|kill|restart|update|run|exec|compose\s+(?:up|down|restart|rm))\b/i,
  /\b(?:sed\s+-i|tee|crontab|visudo)\b/i,
];

export function isHighRiskCommand(command: string) {
  return HIGH_RISK_COMMAND.some((pattern) => pattern.test(command));
}
