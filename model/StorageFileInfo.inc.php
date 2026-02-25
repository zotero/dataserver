<?
class Zotero_StorageFileInfo {
	public $storageFileID;
	public $hash;
	public $filename;
	public $mtime;
	public $size;
	public $contentType;
	public $charset;
	public $zip = false;
	public $itemHash;
	public $itemFilename;
	public $lastAdded;
	// storageUploadQueue columns
	public $uploadKey;
	public $userID;
	public $time;

	public function toJSON() {
		return json_encode(get_object_vars($this));
	}
}
