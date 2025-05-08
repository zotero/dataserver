<?php
class Z_CONFIG {
    private static function getEnv($var) {
        $value = getenv($var);
        if ($value === false) {
            throw new Exception("$var environment variable is not set");
        }
        return $value;
    }

    public static $API_ENABLED = true;
    public static $READ_ONLY = false;
    public static $MAINTENANCE_MESSAGE = 'Server updates in progress. Please try again in a few minutes.';
    public static $BACKOFF = 0;

    public static $TESTING_SITE = false;
    public static $DEV_SITE = false;
    
    public static $DEBUG_LOG = true;
    
    public static $BASE_URI;
    public static $API_BASE_URI;
    public static $WWW_BASE_URI;

    public static $AUTH_SALT = ''; 
    public static $API_SUPER_USERNAME = ''; 
    public static $API_SUPER_PASSWORD = ''; 
    
    public static $AWS_REGION;
    public static $AWS_ACCESS_KEY;
    public static $AWS_SECRET_KEY;
    public static $S3_ENDPOINT;
    public static $S3_BUCKET;
    public static $S3_BUCKET_CACHE = '';
    public static $S3_BUCKET_FULLTEXT;
    public static $S3_BUCKET_ERRORS = '';
    public static $SNS_ALERT_TOPIC = '';

    public static $REDIS_HOSTS = [
        'default' => [
            'host' => ''
        ],
        'request-limiter' => [
            'host' => ''
        ],
        'notifications' => [
            'host' => ''
        ],
        'fulltext-migration' => [
            'host' => '',
            'cluster' => false
        ]
    ];

    public static $REDIS_PREFIX = '';
    
    public static $MEMCACHED_ENABLED = true;
    public static $MEMCACHED_SERVERS = [];

    public static $TRANSLATION_SERVERS = array(
        "translation1.localdomain:1969"
    );
    
    public static $CITATION_SERVERS = array(
        "citeserver1.localdomain:80", "citeserver2.localdomain:80"
    );
    
    public static $SEARCH_HOSTS = ['elasticsearch'];
    
    public static $GLOBAL_ITEMS_URL = '';
    
    public static $ATTACHMENT_PROXY_URL = "https://files.example.com/"; 
    public static $ATTACHMENT_PROXY_SECRET = "";  // new

    public static $STATSD_ENABLED = false;
    public static $STATSD_PREFIX = "";
    public static $STATSD_HOST = "monitor.localdomain";
    public static $STATSD_PORT = 8125;
    
    public static $LOG_TO_SCRIBE = false;
    public static $LOG_ADDRESS = '';
    public static $LOG_PORT = 1463;
    public static $LOG_TIMEZONE = 'US/Eastern';
    public static $LOG_TARGET_DEFAULT = 'errors';
    
    public static $HTMLCLEAN_SERVER_URL;

    // Set some things manually for running via command line
    public static $CLI_PHP_PATH = '/usr/bin/php';
    
    // Alternative to S3_BUCKET_ERRORS
    public static $ERROR_PATH = '/var/log/apache2/';  // new
    
    public static $CACHE_VERSION_ATOM_ENTRY = 1;
    public static $CACHE_VERSION_BIB = 1;
    public static $CACHE_VERSION_ITEM_DATA = 1;
    public static $CACHE_VERSION_RESPONSE_JSON_COLLECTION = 1;  // new
    public static $CACHE_VERSION_RESPONSE_JSON_ITEM = 1;  // new

    public static function init() {
        self::$BASE_URI = self::getEnv('BASE_URI');
        self::$API_BASE_URI = self::getEnv('API_BASE_URI');
        self::$WWW_BASE_URI = self::getEnv('WWW_BASE_URI');

        self::$AUTH_SALT = self::getEnv('AUTH_SALT');
        self::$API_SUPER_USERNAME = self::getEnv('API_SUPER_USERNAME');
        self::$API_SUPER_PASSWORD = self::getEnv('API_SUPER_PASSWORD');

        self::$AWS_REGION = self::getEnv('AWS_DEFAULT_REGION');
        self::$AWS_ACCESS_KEY = self::getEnv('AWS_ACCESS_KEY_ID');
        self::$AWS_SECRET_KEY = self::getEnv('AWS_SECRET_ACCESS_KEY');
        self::$S3_ENDPOINT = self::getEnv('AWS_ENDPOINT_URL_S3');
        self::$S3_BUCKET = self::getEnv('S3_BUCKET');
        if (self::$S3_BUCKET === '') {
            self::$S3_BUCKET = 'zotero';
        }
        self::$S3_BUCKET_FULLTEXT = self::getEnv('S3_BUCKET_FULLTEXT');
        if (self::$S3_BUCKET_FULLTEXT === '') {
            self::$S3_BUCKET_FULLTEXT = 'zotero-fulltext';
        }
        self::$HTMLCLEAN_SERVER_URL = self::getEnv('HTMLCLEAN_SERVER_URL');
        if (self::$HTMLCLEAN_SERVER_URL === '') {
            self::$HTMLCLEAN_SERVER_URL = 'http://tinymce-clean-server:16342';
        }

        self::$REDIS_HOSTS = [
            'default' => [
                'host' => self::getEnv('REDIS_HOST') ?: 'redis'
            ],
            'request-limiter' => [
                'host' => self::getEnv('REDIS_HOST') ?: 'redis'
            ],
            'notifications' => [
                'host' => self::getEnv('REDIS_HOST') ?: 'redis'
            ],
            'fulltext-migration' => [
                'host' => self::getEnv('REDIS_HOST') ?: 'redis',
                'cluster' => false
            ]
        ];

        self::$MEMCACHED_SERVERS = [self::getEnv('MEMCACHED_SERVERS')];
    }
}

Z_CONFIG::init();

// print_r(Z_CONFIG::$BASE_URI . "\r\n");
// print_r(Z_CONFIG::$API_BASE_URI . "\r\n");
// print_r(Z_CONFIG::$WWW_BASE_URI . "\r\n");
// print_r(Z_CONFIG::$AWS_ACCESS_KEY . "\r\n");
// print_r(Z_CONFIG::$AWS_SECRET_KEY . "\r\n");

?>
