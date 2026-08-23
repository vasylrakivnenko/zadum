# the product

the product is an open source platform sponsored by the product to create collaborative consumption marketplaces.

A demo is available at

## Documentation

Documentation is available here

## Contribute

Anyone and everyone is welcome to contribute. Please take a moment to
review the guidelines for contributing.

* Bug reports
* Feature requests
* Pull requests

The ROADMAP list the planned features.

## Changelog
 - Fix similar listings session persisting

CHANGELOG.md list the relevant changes done for each release.

## Community

Stay informed on the product developments on Twitter.

## License

the product is released under the MIT license.

## About Us

the product is a creation of the product specialist of online services sales solutions.

# Prices

All prices (listing, booking, bankwire, refund, ...) are stored in cents and in the default app currency
defined by `the product.currency` parameter.

Entities decimal prices are accessed though `getXXXDecimal` methods.

## VAT

Listing price fixing can be set with or without VAT included depending on the parameter `the product.include_vat` value.

If it's setted to true then:

- listing price fixing include VAT
- all other prices like booking, bank wire, ... include also VAT

If it's setted to false then:

- listing price fixing don't include VAT
- Most of asker relative prices are displayed including VAT
- Most of offerer relative prices are displayed excluding VAT

## Fees

The platform can take fees on each transactions.
Fees rate are defined by the parameters `the product.fee_as_asker` and `the product.fee_as_offerer` parameter.

The administrator can choose to change the fee rate of each user as asker and as offerer.

## Refund

There are two type of cancellation policies **Flexible** and **Strict**.
Each policy define how asker will be refunded according to when he make a cancelation.

These rules are defined by the parameter `the product.booking.cancelation_policy`.

Example:

- Initial amounts:
    - Booking amount excl fees = 95€
    - Asker fees = 10€
    - Offerer fees = 5€
    - Amount payed by asker = 110€

- Amount refunded is 100%: Offerer fees payed by asker are refunded to asker.
    - Amount refunded to asker = 95€ * 1 + 5€ = 100€
    - Amount transferred to offerer wallet = 95€ * (1 - 1)  = 0€
    - Fees taken by the platform = 10€

- Amount refunded is 50%: No fees refunded
    - Amount refunded to asker = 95€ * 0.5  = 47.50€
    - Amount transferred to offerer wallet = 95€ * (1 - 0.5)  = 47.50€
    - Fees taken by the platform = 15€

- Amount refunded is 0%: No fees refunded
    - Amount refunded to asker = 95€ * 0 = 0€
    - Amount transferred to offerer wallet = 95€ * (1 - 0) = 95€
    - Fees taken by the platform = 15€

# Times

## Time unit

Time unit depend on value of some parameters.
See `the product/CoreBundle/Resources/config/parameters.yml` to view default values.

* Day mode

        the product.time_unit: 1440
        the product.time_unit_allday: true

* Night mode:

        the product.time_unit: 1440
        the product.time_unit_allday: false

* Hour mode:

        the product.time_unit: 60
        the product.time_unit_allday: true

Here are other time unit relative parameters:

* Allow single day (start day = end day) booking request and listing search.
    If days_max is set to 1 then must be set to true.

        the product.booking.allow_single_day: true
        the product.booking.end_day_included: true

* Include end day in booking request and listing search and disable single day booking request and listing search
    If days_max is set to 1 then must be set to true

        the product.booking.allow_single_day: false
        the product.booking.end_day_included: true

* Days display mode (range or duration)

        the product.days_display_mode: duration

* Times display mode (range or duration). No effect if time unit is day

        the product.times_display_mode: duration

* Max search, booking time unit number. Min 1. Max value of times max depends on time unit: 24 if time unit is hour.
Not needed if time unit is day.

        the product.times_max: 8

Examples:

* Night mode

        the product.time_unit: 1440
        the product.time_unit_allday: false
        the product.booking.allow_single_day: false
        the product.booking.end_day_included: false
        the product.days_display_mode: duration

* Day mode

        the product.time_unit: 1440
        the product.time_unit_allday: true
        the product.booking.allow_single_day: false
        the product.booking.end_day_included: false
        the product.days_display_mode: duration

* Hour mode

        the product.time_unit: 60
        the product.time_unit_flexibility: 8
        the product.time_unit_allday: true
        the product.days_display_mode: duration
        the product.times_display_mode: duration
        the product.days_max: 1
        the product.times_max: 8
        the product.booking.allow_single_day: true
        the product.booking.end_day_included: true

## Booking Expiration

Booking expiration depends on the following parameters:

    the product.booking.min_start_time_delay
    the product.booking.acceptation_delay
    the product.booking.expiration_delay

Note: min_start_time_delay must be >= the product.booking.acceptation_delay + 1 hour

Booking acceptation and expiration examples:

        min_start_time_delay: 6h
        expiration_delay: 12h
        acceptation_delay: 4h

        new: 10h
        start: 16h

        expired: 22h
        accepted: 12h

        ---------------------------- blocking
        min_start_time_delay: 6h
        expiration_delay: 4h
        acceptation_delay: 12h

        new: 10h
        start: 16h

        expired: 14h
        accepted: 4h problem
        ----------------------------
        min_start_time_delay: 12h
        expiration_delay: 6h
        acceptation_delay: 4h

        new: 10h
        start: 22h

        expired: 16h X
        accepted: 18h
        ----------------------------
        min_start_time_delay: 12h
        expiration_delay: 4h
        acceptation_delay: 6h

        new: 10h
        start: 22h

        expired: 14h X
        accepted: 16h
        ---------------------------- blocking
        min_start_time_delay: 4h
        expiration_delay: 12h
        acceptation_delay: 6h

        new: 10h
        start: 14h

        expired: 22h problem
        accepted: 8h problem
        ---------------------------- blocking
        min_start_time_delay: 4h
        expiration_delay: 6h
        acceptation_delay: 12h

        new: 10h
        start: 14h

        expired: 16h problem
        accepted: 2h problem

        -----------------------------------------------------------
        min_start_time_delay: 4h
        expiration_delay: 4h
        acceptation_delay: 3h

        new: 10h
        start: 14h

        expired: 14h problem
        accepted: 11h
        ---------------------------- blocking
        min_start_time_delay: 4h
        expiration_delay: 3h
        acceptation_delay: 4h

        new: 10h
        start: 14h

        expired: 13h
        accepted: 10h problem
        ---------------------------- blocking
        min_start_time_delay: 4h
        expiration_delay: 4h
        acceptation_delay: 4h

        new: 10h
        start: 14h

        expired: 14h problem
        accepted: 10h problem
        ---------------------------- blocking
        min_start_time_delay: 4h
        expiration_delay: 4h
        acceptation_delay: 5h

        new: 10h
        start: 14h

        expired: 14h problem
        accepted: 9h problem
        ---------------------------- blocking
        min_start_time_delay: 4h
        expiration_delay: 5h
        acceptation_delay: 4h

        new: 10h
        start: 14h

        expired: 15h problem
        accepted: 10h problem

        ----------------------------
        min_start_time_delay: 12h
        expiration_delay: 48h
        acceptation_delay: 4h

        new: 01/01 01h
        start: 01/01 21h

        expired: 03/01 01h problem
        accepted: 01/01 17h

        ----------------------------
        min_start_time_delay: 12h
        expiration_delay: 48h
        acceptation_delay: 4h

        new: 01/01 01h
        start: 02/01 01h

        expired: 03/01 01h problem
        accepted: 01/01 17h

        ----------------------------
        min_start_time_delay: 12h
        expiration_delay: 48h
        acceptation_delay: 4h

        new: 01/01 01h
        start: 05/01 10h

        expired: 03/01 01h
        accepted: 05/01 06h

        ----------------------------
        min_start_time_delay: 12h
        expiration_delay: 2h
        acceptation_delay: 4h

        new: 10h
        start: 16h

        expired: 12h
        accepted: 12h

# Create services accounts

## Create your Google API account

* Go to
* Sign-in with you google account
* Create a new project
* Activate the following APIs
    - Google Places API Web Service
    - Google Maps JavaScript API
    - Google Maps Geocoding API
* Create a Browser API Key and add your domain to the white list
* Create a Server API Key and add your server IP to the white list

In the next chapter "Install the product dependencies" you will add respectively the "Browser API Key"
and the "Server API Key" to the `cocorico_geo.google_place_api_key` and `cocorico_geo.google_place_server_api_key`
parameters in `app/config/parameters.yml`.

*Note: Starting January 31 2018 the Places Web Service API will no longer accept API Keys with HTTP Referer usage restrictions.*
*See

## Create your microsoft Translator account

    See

*Note: Free for 2 millions of characters by month, after it is 10$ per million characters.*
*See

## Create your Facebook Login App

See

* Go to
* Click on "Skip quick start"
* Click on "Settings" and fill in "App Domains" your domain name. (ex:  xxx.com)
* Click on "Add Platform" > "web site"
* Fill in "Site URL" with your site url. (ex:
* Click on "save changes"
* Click on "Advanced".
* Fill in "Valid OAuth redirect URIs" with the urls for the concerned domain and the locales activated.
    Ex for xxx.com with "en" and "fr" as activated locales :

        -
        -

* Click on "Save changes"
* You will then have to add your "Facebook App id" and "secret" in ``the product.facebook.app_id`` and ``the product.facebook.secret`` parameters while composer install described in "Install the product dependencies and set your application parameters" chapter.

# Mails

Mail content are defined by two keys xxx_subject and xxx_message with xxx specific for each mail.
Each key is translated through JMS `
Translation domain is `cocorico_mail`.

## Dev mode

With the **CocoricoSwiftReaderBundle**
you can now consult emails send by the platform through a web interface.

By default emails send are stored in `var/spool/default` folder.
If the parameter `debug_redirects` is set to true the email send will also be displayed in the profiler.
This works only for email not send through ajax.

There are two type of mails:

- Core mails

    - The core mails has send through service `the product/CoreBundle/Mailer/TwigSwiftMailer.php`.
    - New mails method must be declared in `the product/CoreBundle/Mailer/MailerInterface.php`
    - Mails templates are defined in `the product/CoreBundle/Resources/config/Services/mailer.yml`.

- User mails : (registration, password resetting, registration confirmation)

    - The user mails has send through service `the product/UserBundle/Mailer/TwigSwiftMailer.php`
    - New mails method must be declared in `the product/UserBundle/Mailer/MailerInterface.php`
    - Mails templates are defined in `the product/UserBundle/Resources/config/services/mailer.xml`

# Crons

Add this commands to your cron tab and don't forget to set the same PHP timezone "UTC"
in  the php.ini file of php and php-cli.

## Required

1. Currencies update:

    `17 0 * * * php bin/console the product:currency:update --env=dev`

2. Bookings expiration:

    `0 */1 * * * php bin/console the product:bookings:expire --env=dev`

3. Bookings validation:

    `0 */1 * * * php bin/console the product:bookings:validate --env=dev`

4. Bookings bank wires checking:

    `0 */1 * * * php bin/console the product:bookings:checkBankWires --env=dev`

5. Bookings expiring alert:

    `*/15 * * * * php bin/console the product:bookings:alertExpiring --env=dev`

6. Bookings imminent alert:

    `*/15 * * * * php bin/console the product:bookings:alertImminent --env=dev`

7. Listings calendar update alert:

    `0 0 27 * * php bin/console the product:listings:alertUpdateCalendars --env=dev`

## Optionals

1. Listings platform notation computing (Optional. ListingSearchBundle must be enabled):

    `30 2 * * * php bin/console cocorico_listing_search:computeNotation --env=dev`

2. Accept or refuse bookings from SMS (Optional. SMSBundle must be enabled)

    `* * * * *  php bin/console cocorico_sms:bookings:acceptOrRefuseFromSMS --env=dev`

3. Check phone user from SMS (Optional. SMSBundle must be enabled)

    `* * * * *  php bin/console cocorico_sms:users:checkPhoneFromSMS --env=dev`

4. Alert user if new listings are found (Optional. ListingAlertBundle must be enabled)

    `0 3 * * *  php bin/console cocorico_listing_alert:alertNewListingsFound --env=dev`

5. Generate Sitemap (Optional. ListingSeoBundle must be enabled)

    `0 4  * * *  php bin/console cocorico_seo:sitemap:generate --env=dev`

6. Generate Bookings deposit refund (Optional. ListingDepositBundle must be enabled)

    `*/15 *  * * *  php bin/console cocorico_listing_deposit:bookings:generateDepositRefund --env=dev`

7. Check Booking Deposit refund payments (Optional. ListingDepositBundle must be enabled)

    `*/15 *  * * *  php  bin/console cocorico_listing_deposit:bookings:checkDepositsRefund --env=dev`