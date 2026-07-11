# Lokale LotGD-1.1.2-Sandbox. PHP 5.6, weil der Stock-Code (lib/dbwrapper.php)
# DBTYPE hart auf "mysql" setzt - die mysql_*-Extension gibt es ab PHP 7 nicht mehr.
# Alternative ohne PHP 5.6: in spiel/lib/dbwrapper.php DBTYPE auf 'mysqli_proc'
# stellen, dann geht auch php:7.4-apache (docker-php-ext-install mysqli).
FROM php:5.6-apache

RUN docker-php-ext-install mysql mysqli

# Das Spiel ist ISO-8859-1; PHP 5.6 default_charset waere UTF-8 und wuerde die
# Umlaute im Browser zerschiessen.
RUN echo "default_charset = ISO-8859-1" > /usr/local/etc/php/conf.d/lotgd.ini \
 && echo "date.timezone = Europe/Berlin" >> /usr/local/etc/php/conf.d/lotgd.ini \
 && echo "error_reporting = E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING" >> /usr/local/etc/php/conf.d/lotgd.ini
