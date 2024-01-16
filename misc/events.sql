DROP EVENT IF EXISTS purgeOldKeys;
DROP EVENT IF EXISTS purgeStorageUploadQueue;

delimiter |

CREATE EVENT purgeOldKeys
    ON SCHEDULE
        EVERY 1 DAY
    DO
        BEGIN
            DELETE FROM `keys` WHERE lastSeen < NOW() - INTERVAL 2 YEAR;
            DELETE FROM keyAccessLog WHERE timestamp < NOW() - INTERVAL 2 YEAR;
        END |

CREATE EVENT purgeStorageUploadQueue
    ON SCHEDULE
        EVERY 1 DAY
    DO
        BEGIN
            DELETE FROM storageUploadQueue WHERE time < NOW() - INTERVAL 1 DAY;
        END |

delimiter ;
