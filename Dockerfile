FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive 

# Update the base image
RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get -y dist-upgrade && \
    apt-get -y install software-properties-common && \
    add-apt-repository ppa:ondrej/php && \
    apt-get update && \
    # Remove any existing PHP installations first
    apt-get -y remove --purge php* && \
    apt-get -y autoremove && \
    # Then install specific version 8.3 (used in the original)
    apt-get -y install apache2 libapache2-mod-php8.3 composer mysql-client rinetd git \
    php8.3-dev php8.3-xml php8.3-mbstring php8.3-mysql php8.3-memcached php8.3-curl php8.3-redis php8.3-common \
    php8.3-intl \
    libmemcached11 libmemcachedutil2 libmemcached-dev zlib1g-dev

# Setup PHP
RUN sed -i 's/memory_limit = 128M/memory_limit = 1G/g' /etc/php/8.3/apache2/php.ini && \
    sed -i 's/max_execution_time = 30/max_execution_time = 300/g' /etc/php/8.3/apache2/php.ini && \
    sed -i 's/short_open_tag = Off/short_open_tag = On/g' /etc/php/8.3/apache2/php.ini && \
    sed -i 's/short_open_tag = Off/short_open_tag = On/g' /etc/php/8.3/cli/php.ini && \
    sed -i 's/display_errors = On/display_errors = Off/g' /etc/php/8.3/apache2/php.ini && \
    sed -i 's/error_reporting = E_ALL \& ~E_DEPRECATED \& ~E_STRICT/error_reporting = E_ALL \& ~E_NOTICE \& ~E_STRICT \& ~E_DEPRECATED/g' /etc/php/8.3/apache2/php.ini

# Setup igbinary
RUN DEBIAN_FRONTEND=noninteractive update-alternatives --set php /usr/bin/php8.3 && \
    update-alternatives --set phar /usr/bin/phar8.3 && \
    update-alternatives --set phar.phar /usr/bin/phar.phar8.3 && \
    update-alternatives --set phpize /usr/bin/phpize8.3 && \
    update-alternatives --set php-config /usr/bin/php-config8.3 && \
    php -v && \
    php -m | grep xml && \
    pecl channel-update pecl.php.net && \
    # Make sure igbinary is not loaded before installing
    php -m | grep -q igbinary || pecl install igbinary && \
    echo "extension=igbinary.so" > /etc/php/8.3/mods-available/igbinary.ini && \
    phpenmod igbinary

# Setup Memcached
RUN DEBIAN_FRONTEND=noninteractive \
    pecl download memcached-3.2.0 && \
    tar xvzf memcached-3.2.0.tgz && \
    cd memcached-3.2.0 && \
    phpize && \
    ./configure --enable-memcached-igbinary && \
    make && \
    make install && \
    echo "extension=memcached.so" > /etc/php/8.3/mods-available/memcached.ini && \
    ln -s /etc/php/8.3/mods-available/memcached.ini /etc/php/8.3/cli/conf.d/20-memcached.ini && \
    ln -s /etc/php/8.3/mods-available/memcached.ini /etc/php/8.3/apache2/conf.d/20-memcached.ini

# Setup Apache2, Enable the new virtualhost and Override gzip configuration
COPY ./config/apache2/zotero.conf /etc/apache2/sites-available/
COPY ./config/apache2/gzip.conf /etc/apache2/conf-available/
RUN a2enmod rewrite headers && \
    a2dissite 000-default && \
    a2ensite zotero && \
    a2enconf gzip

# Install AWS client
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install && \
    rm awscliv2.zip

# Chown log directory
RUN chown 33:33 /var/log/apache2

WORKDIR /var/www/zotero
    
COPY . .

RUN mv -f ./zf1/library/Zend/* ./include/Zend && \
    rm -rf ./zf1

# Install dependencies
RUN composer install

RUN cp config/config.inc.php ./include/config/config.inc.php && \
    cp config/dbconnect.inc.php ./include/config/dbconnect.inc.php && \
    rm -rf ./config

# Adapt zotero code to work on localhost
RUN sed -i "s#parent::__construct(\$args)#\$args\['use_path_style_endpoint'\] = true;parent::__construct(\$args)#g" ./vendor/aws/aws-sdk-php/src/S3/S3Client.php

# COPY ./init/www.sql /var/www/zotero/misc/www.sql

# Set the entrypoint file
COPY ./entrypoint.sh /
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
