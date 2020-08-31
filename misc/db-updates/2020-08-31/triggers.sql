delimiter //

DROP TRIGGER IF EXISTS fki_itemAttachments;//
CREATE TRIGGER fki_itemAttachments
  BEFORE INSERT ON itemAttachments
  FOR EACH ROW BEGIN
    -- itemAttachments libraryID
    IF NEW.sourceItemID IS NOT NULL AND (SELECT libraryID FROM items WHERE itemID = NEW.itemID) != (SELECT libraryID FROM items WHERE itemID = NEW.sourceItemID) THEN
    SELECT libraryIDs_do_not_match INTO @failure FROM itemAttachments;
    END IF;
    
    -- Make sure this is an attachment item
    IF ((SELECT itemTypeID FROM items WHERE itemID = NEW.itemID) != 14) THEN
    SELECT not_an_attachment INTO @failure FROM items;
    END IF;
    
    -- If there's a parent, reject if it's an attachment or it's a note and this isn't an embedded-image attachment
    SET @parentItemTypeID = IF(NEW.sourceItemID IS NULL, NULL, (SELECT itemTypeID FROM items WHERE itemID = NEW.sourceItemID));
    IF (@parentItemTypeID = 14 OR (@parentItemTypeID = 1 AND NEW.linkMode != 'EMBEDDED_IMAGE')) THEN
    SELECT invalid_parent INTO @failure FROM items;
    END IF;
    
    -- If child, make sure attachment is not in a collection
    IF (NEW.sourceItemID IS NOT NULL AND (SELECT COUNT(*) FROM collectionItems WHERE itemID=NEW.itemID)>0) THEN
    SELECT collection_item_must_be_top_level INTO @failure FROM collectionItems;
    END IF;
  END;//

DROP TRIGGER IF EXISTS fku_itemAttachments_libraryID;//
CREATE TRIGGER fku_itemAttachments_libraryID
  BEFORE UPDATE ON itemAttachments
  FOR EACH ROW BEGIN
    IF NEW.sourceItemID IS NOT NULL AND (SELECT libraryID FROM items WHERE itemID = NEW.itemID) != (SELECT libraryID FROM items WHERE itemID = NEW.sourceItemID) THEN
    SELECT libraryIDs_do_not_match INTO @failure FROM itemAttachments;
    END IF;
    
    -- If there's a parent, reject if it's an attachment or it's a note and this isn't an embedded-image attachment
    SET @parentItemTypeID = IF(NEW.sourceItemID IS NULL, NULL, (SELECT itemTypeID FROM items WHERE itemID = NEW.sourceItemID));
    IF (@parentItemTypeID = 14 OR (@parentItemTypeID = 1 AND NEW.linkMode != 'EMBEDDED_IMAGE')) THEN
    SELECT invalid_parent INTO @failure FROM items;
    END IF;
    
    -- If child, make sure attachment is not in a collection
    IF (NEW.sourceItemID IS NOT NULL AND (SELECT COUNT(*) FROM collectionItems WHERE itemID=NEW.itemID)>0) THEN
    SELECT collection_item_must_be_top_level INTO @failure FROM collectionItems;
    END IF;
  END;//

delimiter ;
