var spinitron = require('spinitron-spinpapi');
var moment = require('moment');
var express = require('express');
var mustache = require('mustache');
var fs = require('fs');

var STATION = 'ksdt'; //your spinitron station ID
var NUM_WEEKS = 12; //number of weeks in the attendance grid


spinitron = new spinitron({
    station: STATION,
    userid: process.env['SPIN_USER'],
    secret: process.env['SPIN_SECRET']
});



var app = express();

app.use(express.static('static'));

var cachedRender;
var cacheTime;

app.get('/', function (req, res) {

    /* if we have rendered within the last hour, serve the cached result */
    if (cachedRender && moment(cacheTime).add(60, 'minutes').isAfter(moment())) {
        console.log("cached");
        res.send(cachedRender);
        return;
    }

    var weeks = []; /* list of weeks in attendance grid */
    var beginningOfThisWeek = moment().startOf('week'); //go to start of this week

    weeks.push({ start: moment(beginningOfThisWeek)} );

    for (var i = 0; i < NUM_WEEKS; i++) { 
        /* go back a week, then add that date to the list */
        weeks.push({ start: moment(beginningOfThisWeek.subtract(1, 'week')) });
    }

    /* generate a nice string for the grid display */
    weeks.forEach(function (week, i) {
        weeks[i].weekstr = 
            "Week of " + week.start.format('MMM D');
    });

    /* load in the grid template */
    var grid = fs.readFileSync('./grid.html', 'utf-8');

    /* get all shows */
    spinitron.getRegularShowsInfo({}, function(err, resp) {

        var shows = resp.results;

        console.log("RESP: ", resp);

        console.log("RESP.RESULTS: ", resp.results);

        //var shows = Object.keys(shows).map(function (k) { return shows[k] });

        try {
            /* helper to get past 99 playlists from a show */
            function getPlaylistsForShow(show) {
                return new Promise(function (resolve, reject) {
                    spinitron.getPlaylistsInfo( { ShowID: show['ShowID'], Num : 99 }, function (err, resp) {
                        if (err) reject(err);
                        else resolve(resp.results ? resp.results : []);
                    });
                });
            }

            var playlistsPromises = [];

            /* get all the playlists for each show */
            shows.forEach(function (show) {
                show.weeks = new Array(weeks.length);
                for (var i = 0; i < weeks.length; i++)
                    show.weeks[i] = {};
                playlistsPromises.push(new Promise(function (resolve, reject) {
                    getPlaylistsForShow(show).then(function(playlists) {
                        show.playlists = playlists && playlists.length ? playlists : [];
                    }).then(resolve).catch(reject);
                }));
            });

            /* for each show, go through the list of weeks. for each week, check if one of the show's playlists was within that week.
             * if so, then mark the week down in the show's week object. */
            Promise.all(playlistsPromises).then(function() {
                shows.forEach(function (show) {
                    show.weeks.forEach(function (week, i) {
                        show.playlists.forEach(function (playlist) {
                            if (moment(playlist['PlaylistDate']).isBetween(weeks[i].start, moment(weeks[i].start).add(1, 'week'))) {
                                week.here = 'here';
                                week.link = 'https://spinitron.com/radio/playlist.php?station=ksdt&playlist='+playlist['PlaylistID'];
                            }
                        });
                    }); 
                });
            }).then(function() { /* then cache and render the result */
                cachedRender = mustache.render(grid, { weekns: weeks, shows: shows });
                cacheTime = moment();
                res.send(cachedRender);
            }).catch(function(err) {
                console.log(err);
                res.send('sorry, there was an error.');
            });
        } catch (e) {
            res.send("Sorry, there was an error processing your request. Please send a message to dj web");
            console.log(e);
        }
    });
});


app.listen(process.env.PORT || 3000);
