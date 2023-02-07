-- Apply to every shard via MySQL CLI
DELIMITER //

DROP TRIGGER IF EXISTS fki_storageFileItems_size;//
CREATE TRIGGER fki_storageFileItems_size
  AFTER INSERT ON storageFileItems
  FOR EACH ROW BEGIN
    UPDATE items JOIN shardLibraries USING (libraryID) SET storageUsage = storageUsage + IFNULL(NEW.size, 0) WHERE itemID=NEW.itemID;
  END;//

DROP TRIGGER IF EXISTS fku_storageFileItems_size;//
CREATE TRIGGER fku_storageFileItems_size
  AFTER UPDATE ON storageFileItems
  FOR EACH ROW BEGIN
    UPDATE items JOIN shardLibraries USING (libraryID) SET storageUsage = storageUsage + (NEW.size - IFNULL(OLD.size, 0)) WHERE itemID=NEW.itemID;
  END;//

DROP TRIGGER IF EXISTS fkd_storageFileItems_size;//
CREATE TRIGGER fkd_storageFileItems_size
  AFTER DELETE ON storageFileItems
  FOR EACH ROW BEGIN
    UPDATE items JOIN shardLibraries USING (libraryID) SET storageUsage = storageUsage - IFNULL(OLD.size, 0) WHERE itemID=OLD.itemID;
  END;//

DROP TRIGGER IF EXISTS fkd_items_storageUsage;//
CREATE TRIGGER fkd_items_storageUsage
  BEFORE DELETE ON items
  FOR EACH ROW BEGIN
    IF OLD.itemTypeID = 14 THEN
      UPDATE storageFileItems JOIN items USING (itemID) JOIN shardLibraries USING (libraryID) SET storageUsage = storageUsage - IFNULL(size, 0) WHERE itemID=OLD.itemID;
    END IF;
  END;//


DELIMITER ;
