DROP EVENT purgeOldKeys;

delimiter |

CREATE EVENT purgeOldKeys
    ON SCHEDULE
        EVERY 1 DAY
    DO
        BEGIN
            DELETE FROM `keys` WHERE lastSeen < NOW() - INTERVAL 2 YEAR;
            DELETE FROM keyAccessLog WHERE timestamp < NOW() - INTERVAL 2 YEAR;
        END |

delimiter ;
